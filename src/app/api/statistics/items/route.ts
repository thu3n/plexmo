import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const ratingKey = searchParams.get("ratingKey");
        const serverId = searchParams.get("serverId");
        const range = searchParams.get("range") || "24h";

        if (!ratingKey) {
            return NextResponse.json({ error: "Missing ratingKey" }, { status: 400 });
        }

        let cutoff = 0;
        const now = Date.now();

        switch (range) {
            case "24h": cutoff = now - (24 * 60 * 60 * 1000); break;
            case "7d": cutoff = now - (7 * 24 * 60 * 60 * 1000); break;
            case "30d": cutoff = now - (30 * 24 * 60 * 60 * 1000); break;
            case "90d": cutoff = now - (90 * 24 * 60 * 60 * 1000); break;
            case "all": cutoff = 0; break;
            default: cutoff = now - (24 * 60 * 60 * 1000);
        }

        // 1. Fetch History AND Library items
        const query = `
            SELECT 
                h.user,
                h.startTime,
                h.ratingKey,
                h.serverId,
                h.title,
                h.subtitle,
                h.meta_json,
                h.duration,
                l.thumb
            FROM activity_history h
            LEFT JOIN library_items l ON h.ratingKey = l.ratingKey AND h.serverId = l.serverId
            WHERE h.startTime > ?
            ORDER BY h.startTime DESC
            LIMIT 100000
        `;
        const historyRows = db.prepare(query).all(cutoff) as any[];

        // 2. Build Mapping
        const libraryItems = db.prepare("SELECT * FROM library_items").all() as any[];
        const { buildUnifiedItemMap } = await import("@/lib/library_groups");
        const unifiedMap = buildUnifiedItemMap(libraryItems);

        // 3. Find Target Unified Item
        // The request gave us a ratingKey/serverId. We need to find *its* unified item.
        let targetUnifiedItem: any = undefined;

        // Check if we can find it via Reverse Lookup
        // Scan map values for source match
        // Optimization: Do this scan once
        for (const item of unifiedMap.values()) {
            if (item.sources.some((s: any) => s.ratingKey === ratingKey && (!serverId || s.serverId === serverId))) {
                targetUnifiedItem = item;
                break;
            }
        }

        // If not found in library items (orphan?), try to match by GUIDs from history if available?
        // But for `items/route.ts`, usually we are clicking FROM the UI derived from popular or library.
        // It SHOULD be in the map.
        // If not, we fall back to raw match on ratingKey.

        const matchedRows: any[] = [];
        const userStats = new Map<string, {
            playCount: number,
            lastWatched: number,
            user: string,
            plays: any[]
        }>();


        for (const row of historyRows) {
            let isMatch = false;

            if (targetUnifiedItem) {
                // If we have a unified target, does this row belong to it?
                // Check if this row's ratingKey/serverId maps to same unified item
                // WE NEED FAST REVERSE LOOKUP HERE.
                // We should assume efficiency is okay, but building full reverse lookup is safer.
                // Let's optimize: Check if `row` key is in `targetUnifiedItem.sources`.
                const rowKey = `${row.serverId}:${row.ratingKey}`;
                // This is O(N * S) where S is sources count (small, <10 usually).
                // Or check unifiedMap by slug?

                // Let's try to match row to unified item
                // We can't easily look up "Which unified item is this row?" without the full map.
                // But we HAVE the full map.
                // Re-scanning entire map for every row is O(H * L). Too slow.
                // We need the `reverseLookup` map.

                // Lazy build reverse lookup, but restricted to "Does it match Target?"
                // Actually, let's just use the `targetUnifiedItem`'s source list.
                // Any history row that matches a source in `targetUnifiedItem` is a match.
                // PLUS: Orphans that resolve to this ID via slug?

                if (targetUnifiedItem.sources.some((s: any) => s.ratingKey === row.ratingKey && s.serverId === row.serverId)) {
                    isMatch = true;
                } else {
                    // Check slug?
                    const slug = `${row.title.toLowerCase().replace(/[^a-z0-9]/g, '')}-${row.year || 'xxxx'}`;
                    if (unifiedMap.get(slug) === targetUnifiedItem) isMatch = true;
                }

            } else {
                // No Unified Item found for target (Orphan target?)
                // Just match exact ratingKey
                if (row.ratingKey == ratingKey && (!serverId || row.serverId == serverId)) {
                    isMatch = true;
                }
            }

            if (!isMatch) continue;

            // Aggregation Logic
            let meta: any = null;
            try { meta = JSON.parse(row.meta_json || '{}'); } catch (e) { }

            // Duration check
            let duration = meta.duration || 0;
            // Best effort duration from target
            if (!duration && targetUnifiedItem) duration = targetUnifiedItem.duration;

            let completionPercentage = 0;
            if (duration > 0) {
                completionPercentage = ((row.duration || 0) * 1000) / duration;
            }

            if (duration > 0 && completionPercentage < 0.15) continue;

            if (!userStats.has(row.user)) {
                userStats.set(row.user, {
                    user: row.user,
                    playCount: 0,
                    lastWatched: 0,
                    plays: []
                });
            }
            const stat = userStats.get(row.user)!;
            stat.playCount += 1;
            if (row.startTime > stat.lastWatched) stat.lastWatched = row.startTime;

            stat.plays.push({
                title: row.title, // Episode title logic?
                originalTitle: row.title,
                date: row.startTime,
                duration: row.duration,
                percent: Math.round(completionPercentage * 100),
                season: meta.parentIndex,
                episode: meta.index
            });
        }

        const users = Array.from(userStats.values()).sort((a, b) => b.lastWatched - a.lastWatched);

        return NextResponse.json({ users });

    } catch (error) {
        console.error("Failed to fetch item details:", error);
        return NextResponse.json({ error: "Failed to fetch details" }, { status: 500 });
    }
}

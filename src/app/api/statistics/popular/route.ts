import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const range = searchParams.get("range") || "24h";
        const type = searchParams.get("type"); // 'movie', 'episode', or 'show'
        const sort = searchParams.get("sort") || "unique_users"; // 'unique_users' or 'total_plays'

        // HYBRID STRATEGIES
        // 1. "All Time" (range='all') -> Use Cached `media_statistics` (Fastest, High Volume)
        // 2. "Time Range" (range!='all') -> Use Live `activity_history` + Live Unification (Accurate for window)

        let results: any[] = [];

        if (range === 'all') {
            // --- STRATEGY: CACHED (From media_statistics) ---
            let sql = `SELECT * FROM media_statistics`;
            const params: any[] = [];
            const conditions: string[] = [];

            if (type) {
                conditions.push("type = ?");
                params.push(type);
            }

            if (conditions.length > 0) {
                sql += ` WHERE ${conditions.join(" AND ")}`;
            }

            // Sort
            if (sort === 'total_plays') {
                sql += ` ORDER BY totalPlays DESC`;
            } else {
                sql += ` ORDER BY uniqueUsers DESC`;
            }

            sql += ` LIMIT 20`;

            const rows = db.prepare(sql).all(params) as any[];
            results = rows.map(row => ({
                title: row.title,
                ratingKey: row.id,
                serverId: 'unified',
                uniqueUsers: row.uniqueUsers,
                totalPlays: row.totalPlays,
                count: sort === 'total_plays' ? row.totalPlays : row.uniqueUsers,
                thumb: row.poster,
                type: row.type,
                year: row.year
            }));

        } else {
            // --- STRATEGY: LIVE AGGREGATION (From activity_history) ---
            // Calculate cutoff
            let cutoff = 0;
            const now = Date.now();
            switch (range) {
                case "24h": cutoff = now - (24 * 60 * 60 * 1000); break;
                case "7d": cutoff = now - (7 * 24 * 60 * 60 * 1000); break;
                case "30d": cutoff = now - (30 * 24 * 60 * 60 * 1000); break;
                case "90d": cutoff = now - (90 * 24 * 60 * 60 * 1000); break;
                default: cutoff = now - (24 * 60 * 60 * 1000);
            }

            // 1. Fetch History Slice
            const query = `
                SELECT 
                    h.title, h.ratingKey, h.serverId, h.meta_json,
                    h.subtitle, h.user, h.duration, h.startTime
                FROM activity_history h
                WHERE h.startTime > ? 
                ORDER BY h.startTime DESC
                LIMIT 50000
            `;
            const historyRows = db.prepare(query).all(cutoff) as any[];

            // 2. Fetch Library Items & Build Unified Map
            const libraryItems = db.prepare("SELECT * FROM library_items").all() as any[];
            const { buildUnifiedItemMap } = await import("@/lib/library_groups");
            const unifiedMap = buildUnifiedItemMap(libraryItems);

            // 3. Build Reverse Lookup
            const reverseLookup = new Map<string, any>();
            const seenItems = new Set<any>();
            for (const item of unifiedMap.values()) {
                if (seenItems.has(item)) continue;
                seenItems.add(item);
                for (const src of item.sources) {
                    reverseLookup.set(`${src.serverId}:${src.ratingKey}`, item);
                }
            }

            // 4. Aggregation
            const statsMap = new Map<string, {
                id: string, title: string, thumb?: string, type: string,
                users: Set<string>, totalPlays: number, totalDuration: number, year?: number
            }>();

            for (const row of historyRows) {
                let unifiedItem = reverseLookup.get(`${row.serverId}:${row.ratingKey}`);
                let unifiedId = unifiedItem?.id;

                if (!unifiedId) {
                    // Fallback using slug
                    const slug = `${row.title.toLowerCase().replace(/[^a-z0-9]/g, '')}-${row.year || 'xxxx'}`;
                    if (unifiedMap.has(slug)) { unifiedItem = unifiedMap.get(slug); unifiedId = unifiedItem?.id; }
                }

                if (!unifiedId) {
                    unifiedId = `orphan:${row.serverId}:${row.ratingKey}`;
                }

                // Filter by type
                const itemType = unifiedItem?.type || (row.subtitle && row.subtitle.match(/S\d+E\d+/) ? 'episode' : 'movie');
                if (type) {
                    if (type === 'show' && (itemType === 'show' || itemType === 'episode')) { /* allow */ }
                    else if (itemType !== type) continue;
                }

                // Duration check
                let totalDurationMs = unifiedItem?.duration || 0;
                if (!totalDurationMs && row.meta_json) {
                    try { const m = JSON.parse(row.meta_json); totalDurationMs = m.duration; } catch (e) { }
                }
                const playedDurationMs = (row.duration || 0) * 1000;
                if (totalDurationMs > 0 && (playedDurationMs / totalDurationMs) < 0.15) continue;

                if (!statsMap.has(unifiedId)) {
                    statsMap.set(unifiedId, {
                        id: unifiedId,
                        title: unifiedItem?.title || row.title,
                        thumb: unifiedItem?.posterPath || (row.thumb ? `/api/proxy/image?serverId=${row.serverId}&thumb=${encodeURIComponent(row.thumb)}` : null),
                        type: itemType,
                        year: unifiedItem?.year,
                        users: new Set(),
                        totalPlays: 0,
                        totalDuration: 0
                    });
                }

                const stat = statsMap.get(unifiedId)!;
                stat.users.add(row.user);
                stat.totalPlays++;
                stat.totalDuration += row.duration;
                if (!stat.thumb && row.thumb) stat.thumb = `/api/proxy/image?serverId=${row.serverId}&thumb=${encodeURIComponent(row.thumb)}`;
            }

            results = Array.from(statsMap.values()).map(s => ({
                title: s.title,
                ratingKey: s.id,
                serverId: 'unified',
                uniqueUsers: s.users.size,
                totalPlays: s.totalPlays,
                count: sort === 'total_plays' ? s.totalPlays : s.users.size,
                thumb: s.thumb,
                type: s.type,
                year: s.year
            })).sort((a, b) => b.count - a.count).slice(0, 20); // Top 20
        }

        return NextResponse.json({
            range,
            data: results
        });

    } catch (error) {
        console.error("Failed to fetch popular stats:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}

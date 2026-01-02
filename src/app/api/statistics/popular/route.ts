import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const range = searchParams.get("range") || "24h";
        const type = searchParams.get("type"); // 'movie', 'episode', or 'show'

        let cutoff = 0;
        const now = Date.now();

        switch (range) {
            case "24h":
                cutoff = now - (24 * 60 * 60 * 1000);
                break;
            case "7d":
                cutoff = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case "30d":
                cutoff = now - (30 * 24 * 60 * 60 * 1000);
                break;
            case "90d":
                cutoff = now - (90 * 24 * 60 * 60 * 1000);
                break;
            case "all":
                cutoff = 0;
                break;
            default:
                cutoff = now - (24 * 60 * 60 * 1000);
        }

        // Fetch a large set of history to aggregate
        let query = `
            SELECT 
                h.title, 
                h.ratingKey, 
                h.serverId,
                h.meta_json,
                h.subtitle,
                l.thumb,
                l.type as library_type,
                l.meta_json as library_meta,
                h.user,
                h.duration
            FROM activity_history h
            LEFT JOIN library_items l ON h.ratingKey = l.ratingKey AND h.serverId = l.serverId
            WHERE h.startTime > ? 
            ORDER BY h.startTime DESC
            LIMIT 5000
        `;

        const params: any[] = [cutoff];
        const rows = db.prepare(query).all(...params) as any[];

        const sort = searchParams.get("sort") || "unique_users"; // 'unique_users' or 'total_plays'

        // ... existing cutoff logic ...
        // (cutoff logic remains same, implicit in existing code above this block, just need to make sure I don't break it)
        // Actually I am replacing the whole logic inside the try block basically from aggregation start

        // Aggregation Map
        // Key: Normalized Identity String
        // Value: { count: Set<user>, totalPlays: number, displayTitle, thumb, ... }
        const aggregated = new Map<string, any>();

        for (const row of rows) {
            // ... metadata extraction (same as before) ...
            let meta: any = null;
            if (row.meta_json) { try { meta = JSON.parse(row.meta_json); } catch (e) { } }
            let libMeta: any = null;
            if (row.library_meta) { try { libMeta = JSON.parse(row.library_meta); } catch (e) { } }
            const effectiveMeta = { ...libMeta, ...meta };

            // 80% Completion Check - Standardized for ALL metrics
            // This ensures "Unique Users" and "Total Plays" are consistent.
            const playedDurationMs = (row.duration || 0) * 1000; // row.duration is in seconds
            const totalDurationMs = effectiveMeta?.duration || 0;

            if (totalDurationMs > 0) {
                const percentage = playedDurationMs / totalDurationMs;
                if (percentage < 0.8) {
                    continue; // Skip this play if less than 80% watched
                }
            }

            // ... type determination (same as before) ...
            let itemType = row.library_type;
            if (!itemType && effectiveMeta && effectiveMeta.type) { itemType = effectiveMeta.type; }

            // ... key generation (same as before) ...
            let uniqueKey = "";
            let displayTitle = row.title;
            let detectedType = itemType;
            let thumb = row.thumb || (effectiveMeta?.thumb || effectiveMeta?.parentThumb || effectiveMeta?.grandparentThumb);

            if (itemType === 'episode' || (effectiveMeta && effectiveMeta.grandparentTitle)) {
                const seriesName = (effectiveMeta?.grandparentTitle || row.title).toLowerCase().trim();
                const realSeriesName = effectiveMeta?.grandparentTitle || row.title;
                if (type === 'show') {
                    if (seriesName) {
                        uniqueKey = `series:${seriesName}`;
                        displayTitle = realSeriesName;
                        detectedType = 'show';
                        if (effectiveMeta?.grandparentThumb) thumb = effectiveMeta.grandparentThumb;
                    }
                } else {
                    let season = effectiveMeta?.parentIndex;
                    let episode = effectiveMeta?.index;
                    if ((season === undefined || episode === undefined) && row.subtitle) {
                        const match = row.subtitle.match(/S(\d+)\s*E(\d+)/i);
                        if (match) { season = parseInt(match[1]); episode = parseInt(match[2]); }
                    }
                    if (seriesName && season !== undefined && episode !== undefined) {
                        uniqueKey = `show:${seriesName}:s${season}:e${episode}`;
                        const niceSeason = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
                        displayTitle = `${realSeriesName} - ${niceSeason}`;
                        if (!detectedType) detectedType = 'episode';
                    } else {
                        uniqueKey = `show:${row.ratingKey}`;
                        if (!detectedType) detectedType = 'episode';
                    }
                }
            } else {
                if (type === 'show') {
                    uniqueKey = "";
                } else {
                    const titleKey = (effectiveMeta?.originalTitle || row.title).toLowerCase().trim();
                    const year = effectiveMeta?.year || row.year || '';
                    uniqueKey = `movie:${titleKey}:${year}`;
                    displayTitle = row.title;
                    if (!detectedType) detectedType = 'movie';
                }
            }

            if (!uniqueKey) continue;

            // Aggregation Update
            if (!aggregated.has(uniqueKey)) {
                aggregated.set(uniqueKey, {
                    users: new Set(),
                    totalPlays: 0,
                    displayTitle: displayTitle,
                    thumb: thumb,
                    serverId: row.serverId,
                    ratingKey: row.ratingKey,
                    type: detectedType
                });
            }

            const exist = aggregated.get(uniqueKey);
            exist.users.add(row.user);
            exist.totalPlays += 1; // Increment total plays

            if (!exist.thumb && thumb) exist.thumb = thumb;
            if (!exist.type && detectedType) exist.type = detectedType;
        }

        // Convert to Array & Sort
        let results = Array.from(aggregated.values()).map(item => ({
            title: item.displayTitle,
            ratingKey: item.ratingKey,
            serverId: item.serverId,
            uniqueUsers: item.users.size,
            totalPlays: item.totalPlays,
            count: sort === 'total_plays' ? item.totalPlays : item.users.size, // Dynamic count for generic UI
            thumb: item.thumb ? `/api/image?path=${encodeURIComponent(item.thumb)}&serverId=${item.serverId}` : null,
            type: item.type
        }));

        // Filter by type if requested
        if (type) {
            results = results.filter(item => item.type === type);
        }

        // Sort based on requested metric
        results.sort((a, b) => b.count - a.count);

        const data = results.slice(0, 10);

        return NextResponse.json({
            range,
            data
        });

    } catch (error) {
        console.error("Failed to fetch popular stats:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}

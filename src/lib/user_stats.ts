import { db } from "./db";
import { HistoryEntry } from "./history";

export type UserStats = {
    global: {
        last24h: { count: number; duration: number };
        last7d: { count: number; duration: number };
        last30d: { count: number; duration: number };
        allTime: { count: number; duration: number };
    };
    platforms: { platform: string; count: number }[];
    players: { player: string; count: number }[];
    recentlyPlayed: HistoryEntry[];
};

const getStatsForPeriod = db.prepare(`
    SELECT COUNT(*) as count, SUM(duration) as duration
    FROM activity_history
    WHERE user = @username AND stopTime > @since
`);

const getAllTimeStats = db.prepare(`
    SELECT COUNT(*) as count, SUM(duration) as duration
    FROM activity_history
    WHERE user = @username
`);

const getPlatformStats = db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM activity_history
    WHERE user = @username AND platform IS NOT NULL
    GROUP BY platform
    ORDER BY count DESC
`);

const getPlayerStats = db.prepare(`
    SELECT json_extract(meta_json, '$.player') as player, COUNT(*) as count
    FROM activity_history
    WHERE user = @username AND meta_json IS NOT NULL
    GROUP BY player
    ORDER BY count DESC
`);

const getRecentlyPlayed = db.prepare(`
    SELECT h.*, s.name as serverName
    FROM activity_history h
    LEFT JOIN servers s ON h.serverId = s.id
    WHERE h.user = @username
    ORDER BY h.stopTime DESC
    LIMIT 20
`);

export const getUserStats = (username: string): UserStats => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const stats24h = getStatsForPeriod.get({ username, since: now - oneDay }) as any;
    const stats7d = getStatsForPeriod.get({ username, since: now - (7 * oneDay) }) as any;
    const stats30d = getStatsForPeriod.get({ username, since: now - (30 * oneDay) }) as any;
    const statsAll = getAllTimeStats.get({ username }) as any;

    const platforms = getPlatformStats.all({ username }) as { platform: string; count: number }[];
    const players = getPlayerStats.all({ username }) as { player: string; count: number }[];
    const recentlyPlayed = (getRecentlyPlayed.all({ username }) as HistoryEntry[]).map(entry => {
        let thumb = undefined;
        let parentThumb = undefined;
        if (entry.meta_json) {
            try {
                const meta = JSON.parse(entry.meta_json);
                thumb = meta.thumb;
                parentThumb = meta.parentThumb;
            } catch (e) {
                // ignore json error
            }
        }
        return {
            ...entry,
            thumb,
            parentThumb
        };
    });

    return {
        global: {
            last24h: { count: stats24h.count || 0, duration: stats24h.duration || 0 },
            last7d: { count: stats7d.count || 0, duration: stats7d.duration || 0 },
            last30d: { count: stats30d.count || 0, duration: stats30d.duration || 0 },
            allTime: { count: statsAll.count || 0, duration: statsAll.duration || 0 },
        },
        platforms,
        players: players.map(p => ({ player: p.player || "Unknown", count: p.count })),
        recentlyPlayed,
    };
};

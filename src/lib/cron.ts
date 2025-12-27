import { getDashboardSnapshot } from "@/lib/plex";
import { syncHistory } from "@/lib/history";
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { sendSessionStartNotification, sendSessionStopNotification } from "./discord";

export async function runCronJob() {
    try {
        // Get all servers
        const servers = db.prepare("SELECT * FROM servers").all() as any[];

        if (!servers.length) {
            return { message: "No servers to sync", success: true };
        }

        const results = await Promise.allSettled(
            servers.map(async (server) => {
                try {
                    const snapshot = await getDashboardSnapshot(server);
                    const { newSessions, endedSessions } = syncHistory(server, snapshot.sessions);

                    // Send Notifications (Fire and forget to not block sync)
                    if (newSessions.length > 0) {
                        newSessions.forEach(s => sendSessionStartNotification(s).catch(e => console.error("Failed to send start notification", e)));
                    }
                    if (endedSessions.length > 0) {
                        endedSessions.forEach(s => sendSessionStopNotification(s).catch(e => console.error("Failed to send stop notification", e)));
                    }

                    return { server: server.name, status: "ok", sessions: snapshot.sessions };
                } catch (err) {
                    console.error(`Failed to sync server ${server.name}:`, err);
                    return { server: server.name, status: "error", error: String(err) };
                }
            })
        );

        const combinedSessions = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => (r as PromiseFulfilledResult<any>).value.sessions || []);

        // Track Most Concurrent Streams (History)
        try {
            const currentCount = combinedSessions.length;
            if (currentCount > 0) {
                // Check last snapshot to avoid duplicates
                const lastSnapshot = db.prepare("SELECT count, sessions FROM concurrent_snapshots ORDER BY timestamp DESC LIMIT 1").get() as any;

                let shouldLog = true;
                if (lastSnapshot) {
                    const lastSessions = JSON.parse(lastSnapshot.sessions);
                    // Simple check: if count differs, log.
                    if (lastSnapshot.count === currentCount) {
                        // Deep check: map session IDs to see if they are the same
                        const currentIds = combinedSessions.map((s: any) => s.id).sort().join(',');
                        const lastIds = lastSessions.map((s: any) => s.id).sort().join(',');

                        if (currentIds === lastIds) {
                            shouldLog = false;
                        }
                    }
                }

                if (shouldLog) {
                    db.prepare("INSERT INTO concurrent_snapshots (count, sessions, timestamp) VALUES (?, ?, ?)")
                        .run(currentCount, JSON.stringify(combinedSessions), Date.now());
                }
            }
        } catch (e) {
            console.error("Failed to update statistics:", e);
        }



        // Always run rule checks to ensure closed sessions are processed/cleaned up
        // even if no active sessions exist (e.g. to close open rule events)
        const { checkAndLogViolations } = await import("./rules");
        await checkAndLogViolations(combinedSessions);

        return {
            success: true,
            results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
        };
    } catch (error) {
        console.error("Cron sync failed:", error);
        throw error;
    }
}

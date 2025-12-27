import { getDashboardSnapshot } from "@/lib/plex";
import { syncHistory } from "@/lib/history";
import { db } from "@/lib/db";
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

import { getDashboardSnapshot } from "@/lib/plex";
import { syncHistory } from "@/lib/history";
import { db } from "@/lib/db";

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
                    syncHistory(server, snapshot.sessions);
                    return { server: server.name, status: "ok" };
                } catch (err) {
                    console.error(`Failed to sync server ${server.name}:`, err);
                    return { server: server.name, status: "error", error: String(err) };
                }
            })
        );

        return {
            success: true,
            results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
        };
    } catch (error) {
        console.error("Cron sync failed:", error);
        throw error;
    }
}

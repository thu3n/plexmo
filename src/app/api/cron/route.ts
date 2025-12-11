import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/plex";
import { syncHistory } from "@/lib/history";
import { db } from "@/lib/db";

// Force dynamic to ensure it runs every time
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        // Get all servers
        const servers = db.prepare("SELECT * FROM servers").all() as any[];

        if (!servers.length) {
            return NextResponse.json({ message: "No servers to sync" });
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

        return NextResponse.json({
            success: true,
            results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
        });
    } catch (error) {
        console.error("Cron sync failed:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

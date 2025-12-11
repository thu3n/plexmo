
import { db } from "../src/lib/db";
import { getDashboardSnapshot } from "../src/lib/plex";

async function debugDashboard() {
    console.log("Starting debugDashboard...");
    const servers = db.prepare("SELECT * FROM servers").all() as any[];
    console.log(`Found ${servers.length} servers in DB.`);

    if (servers.length === 0) {
        console.log("No servers found.");
        return;
    }

    console.log("Fetching snapshots...");
    const results = await Promise.allSettled(
        servers.map(async (server) => {
            console.log(`Fetching for server: ${server.name} (${server.baseUrl})`);
            try {
                const snapshot = await getDashboardSnapshot({
                    id: server.id,
                    name: server.name,
                    baseUrl: server.baseUrl,
                    token: server.token,
                });
                console.log(`Success for ${server.name}: ${snapshot.sessions.length} sessions.`);
                return { ...snapshot, serverId: server.id };
            } catch (err: any) {
                console.error(`Failed for ${server.name}:`, err.message);
                throw err;
            }
        })
    );

    const successResults = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<any>).value);

    console.log(`Successful snapshots: ${successResults.length}`);

    const aggregated = {
        sessions: successResults.flatMap(r => r.sessions),
        summary: successResults.reduce((acc, curr) => ({
            active: acc.active + curr.summary.active,
            directPlay: acc.directPlay + curr.summary.directPlay,
            transcoding: acc.transcoding + curr.summary.transcoding,
            paused: acc.paused + curr.summary.paused,
            bandwidth: acc.bandwidth + curr.summary.bandwidth,
            serverName: "Alla servrar"
        }), { active: 0, directPlay: 0, transcoding: 0, paused: 0, bandwidth: 0 }),
    };

    console.log("Aggregated Summary:", JSON.stringify(aggregated.summary, null, 2));
    console.log("Total Sessions:", aggregated.sessions.length);
}

// Mocking process.env if needed - actually db.ts loads from process.env but might default to dev.db
// We need to make sure we are using the same DB.
// The user's env vars are not loaded automatically by this script unless we use dotenv.
// But db.ts has: const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
// We should check if .env.local exists.

debugDashboard().catch(console.error);

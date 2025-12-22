import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { addHistoryEntry } from "@/lib/history";
import { mapTautulliToPlexmo, TautulliFullEntry } from "@/lib/tautulli-mapper";
import { db as plexmoDb } from "@/lib/db";

export async function POST(request: Request) {
    try {
        const IMPORT_DIR = path.join(process.cwd(), "config", "import", "Tautulli");
        const DB_FILENAME = "tautulli.db";
        const absolutePath = path.join(IMPORT_DIR, DB_FILENAME);

        console.log(`[Import] Starting import from ${absolutePath}`);

        if (!fs.existsSync(absolutePath)) {
            return NextResponse.json({
                error: `Database file not found. Please place 'tautulli.db' in the 'config/import/Tautulli/' folder.`
            }, { status: 400 });
        }

        let tDb;
        try {
            tDb = new Database(absolutePath, { readonly: true });
        } catch (e) {
            console.error("Failed to open Tautulli DB:", e);
            return NextResponse.json({ error: "Could not open Tautulli database. Ensure it is a valid SQLite file." }, { status: 400 });
        }

        // 1. Fetch Servers to map IDs
        const servers = tDb.prepare("SELECT * FROM servers").all() as any[];
        const serverMap: Record<number, string> = {};

        // Direct query to Plexmo DB for servers
        // Schema usually has: id, name, identifier (machineId), baseUrl, token
        const plexmoServers = plexmoDb.prepare("SELECT * FROM servers").all() as any[];

        servers.forEach(ts => {
            // Tautulli: pms_identifier, pms_name, pms_ip
            // Plexmo: name, baseUrl (contains IP)

            // 1. Try match on IP/Url or Name
            // Note: Server schema does not store machine identifier currently.
            let match = plexmoServers.find(ps =>
                (ps.baseUrl && ts.pms_ip && ps.baseUrl.includes(ts.pms_ip)) ||
                (ps.name && ts.pms_name && ps.name === ts.pms_name)
            );

            if (match) {
                serverMap[ts.id] = match.id;
            } else {
                console.warn(`[Import] Could not map Tautulli server: ${ts.pms_name} (${ts.pms_identifier}).`);

                // 3. Fallback: If we have ANY plexmo server, use the first one.
                // This assumes the user is importing history for their current server.
                if (plexmoServers.length > 0) {
                    const fallback = plexmoServers[0];
                    console.warn(`[Import] Falling back to default server: ${fallback.name} (${fallback.id})`);
                    serverMap[ts.id] = fallback.id;
                } else {
                    // No servers in Plexmo at all?
                    // We can't really do much. Keep old behavior just in case.
                    serverMap[ts.id] = "imported-" + ts.id;
                }
            }
        });

        // 2. Fetch History
        // We need to join session_history with media_info and metadata
        // Tautulli schema links them via ... `id`? `reference_id`?
        // session_history.id is PK.
        // media_info.id and metadata.id likely correspond to session_history.id?
        // Let's assume 1:1 mapping on `id`.

        const query = `
            SELECT 
                h.*,
                m.title, m.parent_title, m.grandparent_title, m.original_title, m.year,
                m.thumb, m.parent_thumb, m.grandparent_thumb, m.media_index, m.parent_media_index,
                m.duration,
                mi.*
            FROM session_history h
            LEFT JOIN session_history_metadata m ON h.id = m.id
            LEFT JOIN session_history_media_info mi ON h.id = mi.id
            ORDER BY h.started DESC
        `;

        const rows = tDb.prepare(query).all() as any[];
        console.log(`[Import] Found ${rows.length} entries.`);

        let count = 0;
        const errors = [];

        const importTransaction = plexmoDb.transaction((entries: any[]) => {
            for (const row of entries) {
                try {
                    const mapped = mapTautulliToPlexmo(row, serverMap);
                    // Check if exists?
                    // Primary key is ID. If we use `tautulli-{id}`, unique constraint will fail if exists.
                    // We can use INSERT OR IGNORE or just try-catch.
                    // better-sqlite3 throws on constraint violation.
                    try {
                        addHistoryEntry(mapped);
                        count++;
                    } catch (err: any) {
                        if (err.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                            throw err;
                        }
                        // Ignore duplicates
                    }
                } catch (err) {
                    console.error("Failed to import row:", row.id, err);
                }
            }
        });

        importTransaction(rows);

        tDb.close();

        return NextResponse.json({ success: true, count, message: `Imported ${count} entries.` });

    } catch (error) {
        console.error("[Import Error]", error);
        return NextResponse.json({ error: "Internal Import Error" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { db as plexmoDb } from "@/lib/db";
import { addHistoryEntry } from "@/lib/history";
import { mapTautulliToPlexmo, TautulliFullEntry } from "@/lib/tautulli-mapper";
import { createJob, updateJob } from "@/lib/jobs";

interface TautulliServer {
    id: number;
    name: string;
    identifier: string; // Machine Idenifier
    uri: string;
    address: string;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { url, apiKey, serverMapping } = body;

        // serverMapping is { [sourceId]: targetPlexmoId }
        if (!url || !apiKey || !serverMapping || Object.keys(serverMapping).length === 0) {
            return NextResponse.json({ error: "Missing URL, API Key, or Server Mapping" }, { status: 400 });
        }

        // Clean URL
        const cleanUrl = url.replace(/\/$/, "");
        const apiUrl = `${cleanUrl}/api/v2`;

        // Create Job (Associated with the FIRST target server for now, or a generic system job if we supported it)
        // For UI purposes, we'll pick the first target ID to associate the job notification with, 
        // or just use 'system' if allowed. We'll stick to first target for now.
        const firstTargetId = Object.values(serverMapping)[0] as string;
        const job = createJob('import_tautulli', firstTargetId);

        // Start background process
        (async () => {
            try {
                updateJob(job.id, { status: 'running', message: 'Connecting to Tautulli...', progress: 0 });

                // 1. Verify Connection (Fast check)
                try {
                    // Just check server names to ensure connectivity
                    const res = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=get_server_names`);
                    if (!res.ok) {
                        // Fallback to get_servers_info for standard
                        const res2 = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=get_servers_info`);
                        if (!res2.ok) throw new Error(`API Error ${res2.status}`);
                    }
                } catch (e: any) {
                    updateJob(job.id, { status: 'failed', message: `Connection Failed: ${e.message}` });
                    return;
                }

                // Persist Settings
                try {
                    const stmt = plexmoDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
                    stmt.run("TAUTULLI_URL", cleanUrl);
                    stmt.run("TAUTULLI_API_KEY", apiKey);
                } catch (e) {
                    console.warn("Failed to save Tautulli settings", e);
                }

                // 2. Fetch History (PER SERVER)
                const sourceServerIds = Object.keys(serverMapping);
                let totalImported = 0;
                let grandTotalItems = 0;
                const serverNames: Record<string, string> = {};

                // A. Resolve Server Names
                updateJob(job.id, { message: 'Resolving server names...', progress: 1 });
                try {
                    // Try Fork First
                    const nameRes = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=get_server_names`);
                    if (nameRes.ok) {
                        const nameJson = await nameRes.json();
                        if (nameJson.response?.result === 'success' && Array.isArray(nameJson.response.data)) {
                            nameJson.response.data.forEach((s: any) => {
                                serverNames[s.server_id?.toString()] = s.pms_name;
                            });
                        }
                    }

                    // Try Standard Fallback (augment, don't overwrite if fork succeeded)
                    const infoRes = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=get_servers_info`);
                    if (infoRes.ok) {
                        const infoJson = await infoRes.json();
                        if (infoJson.response?.result === 'success') {
                            const data = infoJson.response.data;
                            const list = Array.isArray(data) ? data : [data];
                            list.forEach((s: any) => {
                                // Standard uses machine_identifier often as key
                                if (s.machine_identifier) serverNames[s.machine_identifier] = s.name;
                                if (s.id) serverNames[s.id.toString()] = s.name;
                            });
                        }
                    }

                } catch (e) {
                    console.warn("Failed to resolve server names", e);
                }

                // B. Pre-fetch Counts
                updateJob(job.id, { message: 'Calculating total items...', progress: 2 });
                const serverCounts: Record<string, number> = {};

                for (const sourceId of sourceServerIds) {
                    const baseServerUrl = `${apiUrl}?apikey=${apiKey}&cmd=get_history&server_id=${sourceId}`;
                    try {
                        const initRes = await fetch(`${baseServerUrl}&length=1&start=0`);
                        const initJson = await initRes.json();
                        if (initJson.response?.result === 'success') {
                            const count = initJson.response.data.recordsFiltered || 0;
                            serverCounts[sourceId] = count;
                            grandTotalItems += count;
                        }
                    } catch (e) {
                        console.error(`Failed to get count for ${sourceId}`, e);
                    }
                }

                updateJob(job.id, { totalItems: grandTotalItems, message: `Starting import of ${grandTotalItems} items...`, progress: 5 });

                // C. Import Loop
                for (const sourceId of sourceServerIds) {
                    const targetId = serverMapping[sourceId];
                    if (!targetId) continue;

                    const serverName = serverNames[sourceId] || `Server ${sourceId}`;
                    const serverTotal = serverCounts[sourceId] || 0;

                    if (serverTotal === 0) continue;

                    let keepFetchingServer = true;
                    let start = 0;
                    const length = 1000;
                    const baseServerUrl = `${apiUrl}?apikey=${apiKey}&cmd=get_history&server_id=${sourceId}`;

                    try {
                        updateJob(job.id, { message: `Importing ${serverName}...` });

                        while (keepFetchingServer) {
                            const historyUrl = `${baseServerUrl}&length=${length}&start=${start}`;
                            const histRes = await fetch(historyUrl);
                            const histJson = await histRes.json();

                            if (histJson.response.result !== 'success') {
                                console.error(`Error fetching history for server ${sourceId}:`, histJson.response.message);
                                break;
                            }

                            const records = histJson.response.data.data;

                            if (!records || records.length === 0) {
                                break;
                            }

                            const importTransaction = plexmoDb.transaction((entries: any[]) => {
                                for (const row of entries) {
                                    try {
                                        // Skip entries with no stopped time (ongoing/incomplete)
                                        if (!row.stopped) continue;

                                        // Strict Duplicate Check
                                        // Check against Activity History
                                        // Allow 60s buffer for start time
                                        const startTimeMs = row.date * 1000;
                                        const bufferMs = 60 * 1000;

                                        const historyDup = plexmoDb.prepare(`
                                            SELECT 1 FROM activity_history 
                                            WHERE user = ? AND ratingKey = ? 
                                            AND startTime >= ? AND startTime <= ?
                                            LIMIT 1
                                        `).get(row.user, String(row.rating_key), startTimeMs - bufferMs, startTimeMs + bufferMs);

                                        if (historyDup) continue;

                                        // Check against Active Sessions
                                        const activeDup = plexmoDb.prepare(`
                                            SELECT 1 FROM active_sessions 
                                            WHERE user = ? AND ratingKey = ? 
                                            AND startTime >= ? AND startTime <= ?
                                            LIMIT 1
                                        `).get(row.user, String(row.rating_key), startTimeMs - bufferMs, startTimeMs + bufferMs);

                                        if (activeDup) continue;


                                        const compatibleEntry: any = {
                                            ...row,
                                            id: row.row_id || row.id,
                                            reference_id: row.reference_id,
                                            server_id: parseInt(sourceId), // FORCE sourceId
                                            started: row.date,
                                            stopped: row.stopped || (row.date + row.duration) || 0,
                                            duration: row.duration * 1000,
                                            title: row.title,
                                            parent_title: row.parent_title,
                                            grandparent_title: row.grandparent_title,
                                            year: row.year,
                                            media_type: row.media_type,
                                            thumb: row.thumb,
                                            parent_thumb: row.parent_thumb,
                                            grandparent_thumb: row.grandparent_thumb,
                                            player: row.player,
                                            user: row.user,
                                            ip_address: row.ip_address,
                                            platform: row.platform,
                                            transcode_decision: row.transcode_decision,
                                        };

                                        if (!compatibleEntry.stopped && compatibleEntry.started && row.duration) {
                                            compatibleEntry.stopped = compatibleEntry.started + row.duration;
                                        }

                                        const singleEntryMap: Record<number, string> = {
                                            [parseInt(sourceId)]: targetId
                                        };
                                        const mapped = mapTautulliToPlexmo(compatibleEntry, singleEntryMap);
                                        addHistoryEntry(mapped);
                                        totalImported++;
                                    } catch (err: any) {
                                        // Ignore duplicates
                                    }
                                }
                            });

                            importTransaction(records);

                            start += length;

                            // Progress Calculation
                            const progressPercent = grandTotalItems > 0
                                ? Math.min(99, Math.round((totalImported / grandTotalItems) * 100))
                                : 0;

                            updateJob(job.id, {
                                progress: progressPercent,
                                itemsProcessed: totalImported,
                                message: `Importing ${serverName} (${start}/${serverTotal})...`
                            });

                            if (start >= serverTotal) {
                                keepFetchingServer = false;
                            }
                        }

                    } catch (err) {
                        console.error(`Error importing server ${sourceId}`, err);
                    }
                }

                updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    itemsProcessed: totalImported,
                    message: `Successfully imported ${totalImported} entries from ${sourceServerIds.length} servers.`
                });

            } catch (err: any) {
                console.error("Background Job Failed:", err);
                updateJob(job.id, { status: 'failed', message: err.message || "Unknown Error" });
            }
        })();

        return NextResponse.json({ success: true, jobId: job.id });

    } catch (error: any) {
        console.error("Tautulli API Import Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}

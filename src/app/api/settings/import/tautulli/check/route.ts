import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { url, apiKey } = body;

        if (!url || !apiKey) {
            return NextResponse.json({ error: "Missing URL or API Key" }, { status: 400 });
        }

        const cleanUrl = url.replace(/\/$/, "");
        const apiUrl = `${cleanUrl}/api/v2`;

        // Strategy 1: Standard Tautulli (get_servers_info)
        let servers: any[] = [];

        try {
            const serversRes = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=get_servers_info`);
            if (serversRes.ok) {
                const data = await serversRes.json();
                if (data.response?.result === 'success') {
                    // Normalize Standard Response
                    const rawData = data.response.data;

                    // Strict check: if rawData is empty object or null, skip
                    if (rawData && Object.keys(rawData).length > 0) {
                        const serverList = Array.isArray(rawData) ? rawData : [rawData];

                        servers = serverList.map((s: any) => ({
                            id: s.machine_identifier,
                            name: s.name,
                            identifier: s.machine_identifier,
                            type: 'standard',
                            param: s.machine_identifier
                        }));
                    }
                }
            }
        } catch (e) {
            console.log("Standard check failed, trying fork strategy...");
        }

        // Strategy 2: Tautulli Fork (get_server_names) if Strategy 1 found nothing
        if (servers.length === 0) {
            try {
                const namesRes = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=get_server_names`);
                if (namesRes.ok) {
                    const data = await namesRes.json();
                    if (data.response?.result === 'success') {
                        // Normalize Fork Response
                        const rawData = data.response.data;
                        // Fork returns array of { server_id, pms_name }
                        if (Array.isArray(rawData) && rawData.length > 0) {
                            servers = rawData.map((s: any) => ({
                                id: s.server_id.toString(),
                                name: s.pms_name,
                                identifier: null,
                                type: 'fork',
                                param: s.server_id
                            }));
                        }
                    }
                }
            } catch (e) {
                console.error("Fork check failed:", e);
            }
        }

        // Strategy 3: Fallback (If connection worked but no info returned - e.g. unconfigured fork)
        if (servers.length === 0) {
            // Verify basic connectivity with a cheap call like 'get_status' or 'arnold'
            try {
                const pingRes = await fetch(`${apiUrl}?apikey=${apiKey}&cmd=arnold`);
                if (pingRes.ok) {
                    // Connection is GOOD, but no server info. Return a generic Default Server.
                    servers = [{
                        id: 'default',
                        name: 'Default Tautulli Server',
                        identifier: 'default', // Placeholder
                        type: 'fork', // Assume fork behavior (manual mapping)
                        param: 1 // Default server_id = 1
                    }];
                }
            } catch (e) {
                // Ignore
            }
        }

        if (servers.length === 0) {
            return NextResponse.json({ error: "Could not retrieve server list from Tautulli. Checked both Standard and Multi-Server methods." }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            servers: servers // Return array of normalized servers
        });

    } catch (error: any) {
        console.error("Tautulli Check Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}

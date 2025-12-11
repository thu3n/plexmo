
import { listInternalServers } from "@/lib/servers";
import { fetchPlexUsers, PlexUser } from "@/lib/plex";
import { importUsers } from "@/lib/users";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    try {
        const servers = await listInternalServers();

        const results = await Promise.all(
            servers.map((server) => fetchPlexUsers(server))
        );

        // Flatten the array of arrays
        const allUsers = results.flat();

        // Return all users (frontend handles display)
        return NextResponse.json({ users: allUsers });
    } catch (error) {
        console.error("Error fetching users:", error);
        return NextResponse.json({ users: [] }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { users } = body;

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        importUsers(users);

        return NextResponse.json({ success: true, count: users.length });
    } catch (error) {
        console.error("Error importing users:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

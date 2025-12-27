import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const range = searchParams.get("range") || "24h";

        let cutoff = 0;
        const now = Date.now();

        switch (range) {
            case "24h":
                cutoff = now - (24 * 60 * 60 * 1000);
                break;
            case "7d":
                cutoff = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case "30d":
                cutoff = now - (30 * 24 * 60 * 60 * 1000);
                break;
            default:
                cutoff = now - (24 * 60 * 60 * 1000);
        }

        const row = db.prepare(`
            SELECT * FROM concurrent_snapshots 
            WHERE timestamp > ? 
            ORDER BY count DESC, timestamp DESC 
            LIMIT 1
        `).get(cutoff) as any;

        if (!row) {
            return NextResponse.json({ count: 0, timestamp: null, sessions: [] });
        }

        return NextResponse.json({
            count: row.count,
            timestamp: row.timestamp,
            sessions: JSON.parse(row.sessions)
        });

    } catch (error) {
        console.error("Failed to fetch concurrent stats:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}

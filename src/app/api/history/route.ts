import { NextResponse } from "next/server";
import { getHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get("serverId") || undefined;

    const history = getHistory(serverId);

    return NextResponse.json({ history });
}

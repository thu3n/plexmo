import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const path = searchParams.get("path");
    const serverId = searchParams.get("serverId");

    // Getting servers can be expensive if done every request, but for now we need the address.
    // Ideally, passing the full URL encoded might be easier if we trust the source (which is our own API).
    // But to be safer/cleaner, let's accept the full URL if it's from our local subnet, or just proxy what we are given.
    // The user's error shows full URLs in session.thumb: http://192.168.1.113:32400/...

    // Strategy: The frontend (SessionCard) will pass the Full Insecure URL.
    // We will fetch it server-side (where we can access the private IP) and return it.

    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
        return new NextResponse("Missing url param", { status: 400 });
    }

    try {
        const headers = new Headers();
        // Forward relevant headers if needed, e.g. X-Plex-Token is likely in the URL query string already.

        const response = await fetch(targetUrl, {
            headers: {
                "Accept": "image/*"
            }
        });

        if (!response.ok) {
            return new NextResponse(`Failed to fetch image: ${response.status} ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get("Content-Type") || "image/jpeg";
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600"
            }
        });

    } catch (error) {
        console.error("Image proxy error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

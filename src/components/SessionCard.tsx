import { PlexSession } from "@/lib/plex";
import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext";

const stateColor = (state: string) => {
    const s = state?.toLowerCase() || "";
    if (s === "playing") return "text-emerald-400";
    if (s === "paused") return "text-amber-400";
    if (s === "buffering") return "text-cyan-400 animate-pulse";
    return "text-slate-400";
};

const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    // Format as mm:ss. If > 60 mins, maybe hh:mm:ss?
    // User asked for "antal minuter", mm:ss is standard for players.
    // If minutes > 60, it will just show e.g. 90:00 which is fine.
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${minutes}:${pad(seconds)}`;
};

const getPlayerIcon = (player: string | undefined, platform: string | undefined) => {
    const p = (player || platform || "").toLowerCase();

    // Android
    if (p.includes("android")) {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400">
                <title>Android</title>
                <path d="M17.523 15.3414C17.523 16.7113 16.4069 17.8284 15.0289 17.8284C13.6508 17.8284 12.5368 16.7113 12.5368 15.3414C12.5368 13.9715 13.6508 12.8564 15.0289 12.8564C16.4069 12.8564 17.523 13.9715 17.523 15.3414ZM7.4457 15.3414C7.4457 16.7113 6.3317 17.8284 4.9537 17.8284C3.5756 17.8284 2.4595 16.7113 2.4595 15.3414C2.4595 13.9715 3.5756 12.8564 4.9537 12.8564C6.3317 12.8564 7.4457 13.9715 7.4457 15.3414ZM18.784 10.9926V19.4632C18.784 20.3705 18.043 21.1136 17.135 21.1136H2.8481C1.9401 21.1136 1.1991 20.3705 1.1991 19.4632V10.9926H18.784ZM15.5309 2.9234L17.595 5.5606C17.755 5.7656 17.7129 6.0596 17.508 6.2205C17.3021 6.3805 17.008 6.3385 16.848 6.1326L14.7339 3.4316C13.2049 2.7215 11.5169 2.6565 9.9488 3.2505L7.7468 6.1605C7.5798 6.3595 7.2849 6.3906 7.0858 6.2235C6.8869 6.0566 6.8558 5.7616 7.0228 5.5615L9.3099 2.5395C8.0169 2.2225 6.6669 2.2855 5.4188 2.7665C2.9279 3.7255 1.1901 6.0956 1.1901 8.8785H18.793C18.793 6.0276 16.994 3.6166 14.4239 2.6936C14.7949 2.7536 15.1639 2.8295 15.5309 2.9234Z" />
            </svg>
        );
    }
    // Apple / iOS / Safari
    if (p.includes("ios") || p.includes("apple") || p.includes("iphone") || p.includes("ipad") || p.includes("safari") || p.includes("tvos")) {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                <title>Apple</title>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.96 1.07-3.11-1.05.05-2.31.71-3.06 1.58-.69.8-1.26 2.05-1.1 3.14 1.17.08 2.37-.78 3.09-1.61" />
            </svg>
        );
    }
    // Chrome
    if (p.includes("chrome")) {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-400">
                <title>Chrome</title>
                <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12 12-5.373 12-12S18.628 0 12 0zm0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                <circle cx="12" cy="12" r="4" fill="currentColor" className="text-white" />
            </svg>
        );
    }
    // Firefox
    if (p.includes("firefox")) {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-orange-500">
                <title>Firefox</title>
                <path d="M21.196 15.328c-.808 3.5-3.665 6.27-7.447 7.087-5.91 1.277-11.233-2.613-11.758-8.216-.402-4.295 1.77-8.272 5.09-10.45l.93 1.43c-2.427 1.637-4.008 4.545-3.75 7.643.344 4.148 4.14 7.027 8.356 6.262 2.618-.475 4.706-2.32 5.566-4.705.53-1.465.558-3.023.1-4.47-.563-1.78-1.85-3.23-3.483-4.12l1.018-1.722c2.2.982 3.935 3.033 4.67 5.438.563 1.838.528 3.824-.292 5.823z" />
            </svg>
        );
    }
    // LG
    if (p.includes("lg") || p.includes("webos")) {
        return (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-pink-500">
                <title>LG TV</title>
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm1 3v7h2.5v2H11V5h2zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
            </svg>
        );
    }
    // Plex
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-500">
            <title>Plex</title>
            <path d="M11.643 0H4.357L0 12l4.357 12h7.286L16 12 11.643 0zM24 12l-4.357-12h-7.286L16.714 12l-4.357 12h7.286L24 12z" />
        </svg>
    );
};

export const SessionCard = ({ session, serverColor }: { session: PlexSession; serverColor?: string }) => {
    const { t } = useLanguage();
    const barColor = serverColor || "#f59e0b"; // Default to amber-500
    const isTranscoding = session.decision?.toLowerCase() === "transcode";

    // ... existing logic ...
    const isTV = /^(S\d+|\d+x\d+)/.test(session.subtitle || "") || /^S\d+ E\d+$/.test(session.subtitle || "");

    const playerIcon = getPlayerIcon(session.player, session.platform);

    // Live Timer Logic
    const [currentOffset, setCurrentOffset] = useState(session.viewOffset);

    useEffect(() => {
        setCurrentOffset(session.viewOffset);
    }, [session.viewOffset]);

    useEffect(() => {
        if (session.state !== "playing") return;

        const interval = setInterval(() => {
            setCurrentOffset((prev) => {
                // Don't go past duration
                return Math.min(prev + 1000, session.duration);
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [session.state, session.duration]);

    // derived progress
    const progressPercent = session.duration > 0
        ? Math.min(100, (currentOffset / session.duration) * 100)
        : 0;

    // Format bitrate to Mbps
    const bitrate = session.bandwidth ? `${Math.round(session.bandwidth / 1000 * 10) / 10} Mbps` : null;

    return (
        <div
            className="group flex flex-col overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/5 backdrop-blur-md transition-all hover:ring-white/10 hover:bg-black/50"
        >
            {/* Top Section: Poster + Details */}
            <div className="flex aspect-video w-full sm:aspect-[2/1]">
                {/* Poster Image (Left) */}
                <div className="relative h-full w-[35%] shrink-0 overflow-hidden border-r border-white/5">
                    {session.thumb ? (
                        <img
                            src={`/api/image?url=${encodeURIComponent(session.thumb)}`}
                            alt={session.title}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-800/50 text-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Details Panel (Right) - Glassy & Tight */}
                <div className="relative flex-1 p-3 text-[11px] sm:text-xs font-medium leading-tight text-white/70">
                    <div className="flex flex-col gap-1.5">
                        {/* Server */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.server")}</span>
                            <span className="truncate text-white/90">{session.serverName}</span>
                        </div>
                        {/* Player */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.player")}</span>
                            <div className="truncate text-white/90">{session.player}</div>
                        </div>
                        {/* Quality */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.quality")}</span>
                            <div className="truncate">
                                <span className="text-white/90">{session.resolution || "Original"}</span>
                                {bitrate && <span className="text-white/40 ml-1">({bitrate})</span>}
                            </div>
                        </div>

                        <div className="my-1 h-px w-full bg-white/5" />

                        {/* Stream */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.stream")}</span>
                            <span className={isTranscoding ? "text-amber-400" : "text-emerald-400"}>
                                {isTranscoding ? t("session.transcode") : t("session.directPlay")}
                            </span>
                        </div>
                        {/* Container */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.container")}</span>
                            <span className="truncate text-white/90 uppercase">{session.container || "MKV"}</span>
                        </div>
                        {/* Location */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.location")}</span>
                            <div className="truncate text-white/90">
                                {session.location === "wan" ? (
                                    <span className="flex items-center gap-1">{t("session.wan")}</span>
                                ) : (
                                    <span>{t("session.lan")}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Bar (Thin Line) */}
            <div className="bg-white/5 h-[2px] w-full relative">
                <div
                    className="h-full absolute top-0 left-0 transition-all duration-1000 linear opacity-80"
                    style={{
                        width: `${progressPercent}%`,
                        backgroundColor: barColor,
                        boxShadow: `0 0 10px ${barColor}`
                    }}
                />
            </div>

            {/* Footer Section - Glassy Background */}
            <div className="flex items-center justify-between bg-black/20 px-3 py-2 border-t border-white/5">
                {/* Left: Status Icon + Title + Meta/Timer */}
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {/* Status Icon */}
                    <div className={`${stateColor(session.state)}`}>
                        {session.state === 'paused' ? (
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                        ) : (
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                    </div>

                    <div className="flex flex-col justify-center min-w-0">
                        <h3 className="truncate text-xs font-bold text-white/90 leading-none">
                            {session.title}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/50 font-medium leading-none">
                            {/* Subtitle / Movie Year */}
                            {isTV ? (
                                <span className="truncate">{session.subtitle}</span>
                            ) : (
                                // Movie Format: Icon + Year
                                <div className="flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white/40">
                                        <path fillRule="evenodd" d="M1 4.75C1 3.784 1.784 3 2.75 3h14.5c.966 0 1.75.784 1.75 1.75v10.515a1.75 1.75 0 0 1-1.75 1.75h-1.5c-.078 0-.155-.005-.23-.015H4.48c-.075.01-.152.015-.23.015h-1.5A1.75 1.75 0 0 1 1 15.265V4.75Zm15 1.5H4v7.5h12v-7.5Z" clipRule="evenodd" />
                                    </svg>
                                    <span>{session.year || "Unknown Year"}</span>
                                </div>
                            )}

                            {/* Divider */}
                            <span>•</span>

                            {/* Live Timer */}
                            <span className="font-mono text-white/60">
                                {formatTime(currentOffset)} / {formatTime(session.duration)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right: User Avatar */}
                <div className="ml-3 flex shrink-0 items-center justify-center">
                    <div className="relative group/user cursor-help">
                        {/* Avatar Ring */}
                        <div className="absolute -inset-0.5 rounded-full bg-gradient-to-tr from-white/10 to-white/0 opacity-0 transition-opacity group-hover/user:opacity-100" />
                        <img
                            src={`https://ui-avatars.com/api/?name=${session.user}&background=random&color=fff&size=64`}
                            alt={session.user}
                            className="relative h-7 w-7 rounded-full bg-slate-800 object-cover ring-1 ring-white/10"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

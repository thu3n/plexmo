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

const getStreamColor = (isDirect: boolean) => {
    return isDirect ? "text-emerald-400" : "text-amber-400";
};

const formatAudioChannels = (channels?: string | number) => {
    if (!channels) return "";
    const c = String(channels);
    if (c === "2") return "Stereo";
    if (c === "6") return "5.1";
    if (c === "8") return "7.1";
    return c;
};

const formatVideoRes = (height?: string | number) => {
    if (!height) return "";
    // If it already has 'p' or 'i', just return it
    if (String(height).toLowerCase().match(/[pi]$/)) return String(height);
    return `${height}p`;
};

const getPlayerIcon = (player: string | undefined, platform: string | undefined, className: string = "w-5 h-5") => {
    const p = (player || platform || "").toLowerCase();

    const platformMap: Record<string, string> = {
        "android": "android",
        "ios": "ios",
        "apple": "ios",
        "iphone": "ios",
        "ipad": "ios",
        "tvos": "atv",
        "chrome": "chrome",
        "firefox": "firefox",
        "edge": "msedge",
        "safari": "safari",
        "lg": "lg",
        "webos": "lg",
        "samsung": "samsung",
        "tizen": "samsung",
        "roku": "roku",
        "playstation": "playstation",
        "ps4": "playstation",
        "ps5": "playstation",
        "xbox": "xbox",
        "wiiu": "wiiu",
        "kodi": "kodi",
        "plexamp": "plexamp",
        "linux": "linux",
        "macos": "macos",
        "osx": "macos",
        "windows": "windows",
        "opera": "opera",
        "ie": "ie",
        "dlna": "dlna",
        "chromecast": "chromecast",
        "alexa": "alexa",
        "tivo": "tivo"
    };

    const platformColors: Record<string, string> = {
        "alexa": "#00caff",
        "android": "#3ddc84",
        "atv": "#a2aaad",
        "chrome": "#db4437",
        "chromecast": "#4285f4",
        "default": "#e5a00d",
        "dlna": "#4ba32f",
        "firefox": "#ff7139",
        "gtv": "#008bcf",
        "ie": "#18bcef",
        "ios": "#a2aaad",
        "kodi": "#30aada",
        "lg": "#990033",
        "linux": "#0099cc",
        "macos": "#a2aaad",
        "msedge": "#0078d7",
        "opera": "#fa1e4e",
        "playstation": "#003087",
        "plex": "#e5a00d",
        "plexamp": "#e5a00d",
        "roku": "#673293",
        "safari": "#00d3f9",
        "samsung": "#034ea2",
        "synclounge": "#151924",
        "tivo": "#00a7e1",
        "wiiu": "#03a9f4",
        "windows": "#0078d7",
        "wp": "#68217a",
        "xbmc": "#3b4872",
        "xbox": "#107c10"
    };

    let icon = "plex"; // Default icon
    let color = "#e5a00d"; // Default color (plex/default)

    // Check specific mappings first
    for (const [key, value] of Object.entries(platformMap)) {
        if (p.includes(key)) {
            icon = value;
            if (platformColors[icon]) {
                color = platformColors[icon];
            }
            break;
        }
    }

    return (
        <div
            className={`flex items-center justify-center rounded-sm shadow-sm ${className}`}
            style={{ backgroundColor: color, minWidth: '20px', minHeight: '20px' }}
            title={player || platform}
        >
            <img
                src={`/images/platforms/${icon}.svg`}
                alt={player || "Player"}
                className="w-[70%] h-[70%] object-contain"
                onError={(e) => {
                    e.currentTarget.src = "/images/platforms/plex.svg";
                }}
            />
        </div>
    );
};

const HoverReveal = ({ current, original, isDirect }: { current: React.ReactNode, original: React.ReactNode, isDirect: boolean }) => {
    if (isDirect) {
        return <span className="text-emerald-400">{original}</span>;
    }
    return (
        <div className="group/reveal relative inline-block cursor-help align-top max-w-full truncate">
            <span className="block group-hover/reveal:hidden text-amber-400 truncate">
                {current}
            </span>
            <span className="hidden group-hover/reveal:block text-emerald-400 truncate">
                {original}
            </span>
        </div>
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

                    {/* Platform Icon - Top Right */}
                    <div className="absolute top-3 right-3">
                        {/* Override icon size for corner display */}
                        {session.player && getPlayerIcon(session.player, session.platform, "w-[60px] h-[60px] shadow-lg")}
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1">
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
                                <HoverReveal
                                    isDirect={session.isOriginalQuality}
                                    current={
                                        <span>
                                            {session.resolution} (Convert)
                                            <span className="opacity-70"> • {bitrate || "Unknown"}</span>
                                        </span>
                                    }
                                    original={
                                        <span>
                                            Original <span className="opacity-70">({session.resolution})</span>
                                        </span>
                                    }
                                />
                            </div>
                        </div>

                        <div className="my-1 h-px w-full bg-white/5" />

                        {/* Stream */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.stream")}</span>
                            <HoverReveal
                                isDirect={!isTranscoding && session.decision !== "direct stream"}
                                current={
                                    session.decision === "direct stream"
                                        ? "Direct Stream"
                                        : `${t("session.transcode")} (Throttled)`
                                }
                                original={t("session.directPlay")}
                            />
                        </div>
                        {/* Container */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.container")}</span>
                            <HoverReveal
                                isDirect={!session.transcodeContainer}
                                current={
                                    <span>
                                        Transcode <span className="text-white/50 ml-1">({(session.originalContainer || "").toUpperCase()} &rarr; {(session.transcodeContainer || "").toUpperCase()})</span>
                                    </span>
                                }
                                original={(session.originalContainer || "MKV").toUpperCase()}
                            />
                        </div>
                        {/* Video */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">VIDEO</span>
                            <HoverReveal
                                isDirect={session.videoDecision === "direct play" || session.videoDecision === "direct stream"}
                                current={
                                    <span>
                                        Transcode <span className="text-white/50 ml-1">
                                            ({(session.transcodeVideoCodec || "").toUpperCase()} {formatVideoRes(session.transcodeHeight)})
                                        </span>
                                    </span>
                                }
                                original={
                                    <span>
                                        {session.videoDecision === "direct stream" ? "Direct Stream" : "Direct Play"} <span className="text-white/50 ml-1">
                                            ({(session.originalVideoCodec || "").toUpperCase()} {formatVideoRes(session.originalHeight || session.resolution)})
                                        </span>
                                    </span>
                                }
                            />
                        </div>
                        {/* Audio */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">AUDIO</span>
                            <HoverReveal
                                isDirect={session.audioDecision === "direct play" || session.audioDecision === "direct stream"}
                                current={
                                    <span>
                                        Transcode <span className="text-white/50 ml-1">
                                            ({(session.transcodeAudioCodec || "").toUpperCase()} {formatAudioChannels(session.transcodeAudioChannels)})
                                        </span>
                                    </span>
                                }
                                original={
                                    <span>
                                        {session.audioDecision === "direct stream" ? "Direct Stream" : "Direct Play"} <span className="text-white/50 ml-1">
                                            ({(session.originalAudioCodec || "").toUpperCase()} {formatAudioChannels(session.originalAudioChannels)})
                                        </span>
                                    </span>
                                }
                            />
                        </div>
                        {/* Subtitle */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">SUBTITLE</span>
                            <div className={getStreamColor(session.subtitleDecision !== "transcode" && session.subtitleDecision !== "burn")}>
                                {session.subtitleDecision === "transcode" || session.subtitleDecision === "burn" ? "Burn-in" : "Direct Stream"}
                                <span className="text-white/50 ml-1">(SRT)</span>
                            </div>
                        </div>

                        {/* Location */}
                        <div className="grid grid-cols-[65px_1fr] gap-2 items-baseline">
                            <span className="text-white/30 font-bold uppercase tracking-wider text-right text-[10px]">{t("session.location")}</span>
                            <div className="truncate text-white/90">
                                {session.location === "wan" ? (
                                    <span className="flex items-center gap-1">{session.ip || t("session.wan")}</span>
                                ) : (
                                    <span>{t("session.lan")}: {session.ip}</span>
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

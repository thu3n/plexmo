"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { UserStats } from "@/lib/user_stats";
import { HistoryEntry } from "@/lib/history";
import { HistoryModal } from "@/components/HistoryModal";
import { useLanguage } from "@/components/LanguageContext";

const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch stats");
    return response.json();
};

const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`;
};

const StatCard = ({ title, count, duration, color }: { title: string; count: number; duration: number; color: string }) => (
    <div className={`relative overflow-hidden rounded-2xl bg-${color}-500/10 p-6 border border-${color}-500/20`}>
        <div className={`absolute top-0 right-0 p-4 opacity-10`}>
            {/* Background Icon/Graphic could go here */}
            <svg className={`h-24 w-24 text-${color}-500`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
        </div>
        <h3 className="text-sm font-medium text-white/60 mb-1">{title}</h3>
        <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{count}</span>
            <span className="text-sm text-white/40">plays</span>
        </div>
        <div className={`mt-2 inline-flex items-center rounded-lg bg-${color}-500/20 px-2.5 py-1 text-sm font-medium text-${color}-300`}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatDuration(duration)}
        </div>
    </div>
);

const getPlayerIconInfo = (player: string | undefined, platform: string | undefined): { icon: string, color: string } => {
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

    let icon = "plex";
    let color = "#e5a00d";

    for (const [key, value] of Object.entries(platformMap)) {
        if (p.includes(key)) {
            icon = value;
            if (platformColors[icon]) {
                color = platformColors[icon];
            }
            break;
        }
    }
    return { icon, color };
};

const PlatformIcon = ({ name, count }: { name: string, count: number }) => {
    const { icon, color } = getPlayerIconInfo(name, name);
    return (
        <div className="flex flex-col items-center gap-2 min-w-[80px] p-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
            <div
                className="flex h-14 w-14 items-center justify-center rounded-xl shadow-lg transition-transform hover:scale-105"
                style={{ backgroundColor: color }}
            >
                <img
                    src={`/images/platforms/${icon}.svg`}
                    alt={name}
                    className="h-8 w-8 invert brightness-0"
                />
            </div>
            <div className="text-center w-full">
                <span className="block text-xs font-semibold text-white/90 truncate w-full" title={name}>{name || "Unknown"}</span>
                <span className="block text-[10px] font-medium text-white/50">{count} plays</span>
            </div>
        </div>
    );
};

import { useSearchParams } from "next/navigation";

export default function UserStatsPage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = use(params);
    const decodedUsername = decodeURIComponent(username);
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    const fromDashboard = searchParams.get("from") === "dashboard";
    const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

    // Construct back link with query params
    const backLink = fromDashboard ? "/" : "/settings/users";

    const { data: stats, isLoading, error } = useSWR<UserStats>(
        username ? `/api/stats/user?username=${encodeURIComponent(decodedUsername)}` : null,
        fetchJson
    );

    if (error) return <div className="p-8 text-rose-400">Error loading stats.</div>;
    if (isLoading) return <div className="p-8 text-white/50">Loading stats...</div>;
    if (!stats) return null;

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-amber-500/30 overflow-x-hidden">
            <main className="mx-auto max-w-6xl px-6 py-12">
                {/* Header */}
                <header className="mb-8 flex items-center gap-6">
                    <Link
                        href={backLink}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-white/10">
                            <img
                                src={`https://ui-avatars.com/api/?name=${decodedUsername}&background=random&color=fff&size=128`}
                                alt={decodedUsername}
                                className="h-full w-full object-cover"
                            />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white">{decodedUsername}</h1>
                            <p className="text-white/40">User Statistics</p>
                        </div>
                    </div>
                </header>

                {/* Global Stats Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-12">
                    <StatCard title="Last 24 Hours" count={stats.global.last24h.count} duration={stats.global.last24h.duration} color="emerald" />
                    <StatCard title="Last 7 Days" count={stats.global.last7d.count} duration={stats.global.last7d.duration} color="cyan" />
                    <StatCard title="Last 30 Days" count={stats.global.last30d.count} duration={stats.global.last30d.duration} color="indigo" />
                    <StatCard title="All Time" count={stats.global.allTime.count} duration={stats.global.allTime.duration} color="amber" />
                </div>

                <div className="grid gap-8 lg:grid-cols-3">
                    {/* Platform & Player Usage */}
                    <div className="lg:col-span-1 min-w-0">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl h-full flex flex-col justify-between">
                            {/* Platforms - Top 50% */}
                            <div className="flex-1 pb-6 overflow-hidden">
                                <h2 className="mb-4 text-xl font-bold text-white">Platform Usage</h2>
                                <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar mask-linear-fade w-full">
                                    {stats.platforms.map((p) => (
                                        <PlatformIcon key={p.platform} name={p.platform} count={p.count} />
                                    ))}
                                    {stats.platforms.length === 0 && (
                                        <p className="text-white/30 text-sm">No platform data available.</p>
                                    )}
                                </div>
                            </div>

                            {/* Divider with dots */}
                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-white/10" />
                                </div>
                            </div>

                            {/* Players - Bottom 50% */}
                            <div className="flex-1 pt-6 overflow-hidden">
                                <h2 className="mb-4 text-xl font-bold text-white">Player Usage</h2>
                                <div className="flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar mask-linear-fade w-full">
                                    {stats.players?.map((p) => (
                                        <PlatformIcon key={p.player} name={p.player} count={p.count} />
                                    ))}
                                    {(!stats.players || stats.players.length === 0) && (
                                        <p className="text-white/30 text-sm">No player data available.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recently Played */}
                    <div className="lg:col-span-2 min-w-0">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                            <h2 className="mb-6 text-xl font-bold text-white">Recently Played</h2>
                            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar mask-linear-fade w-full">
                                {stats.recentlyPlayed.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="group relative aspect-[2/3] min-w-[160px] w-[160px] overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/10 transition-all hover:scale-105 hover:ring-amber-500/50 hover:shadow-lg hover:shadow-black/50 shrink-0 flex flex-col cursor-pointer"
                                        onClick={() => setSelectedEntry(entry)}
                                    >
                                        {/* Poster Image */}
                                        <div className="relative flex-1 overflow-hidden">
                                            {(entry.thumb || entry.parentThumb) ? (
                                                <img
                                                    src={`/api/image?path=${encodeURIComponent(entry.parentThumb || entry.thumb || "")}&serverId=${entry.serverId}`}
                                                    alt={entry.title}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center bg-slate-800">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src="/images/Plexmo_icon.png"
                                                        alt="No Poster"
                                                        className="h-12 w-12 object-contain opacity-20 grayscale"
                                                    />
                                                </div>
                                            )}

                                            {/* Diagonal Ribbon for Date */}
                                            <div className="absolute top-[16px] -right-[28px] w-[100px] rotate-45 bg-amber-500 py-[2px] text-center text-[9px] font-bold text-black shadow-sm z-10">
                                                {new Date(entry.stopTime).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                                            </div>
                                        </div>

                                        {/* Simplified Footer Content */}
                                        <div className="bg-black/80 backdrop-blur-md p-3 border-t border-white/10 shrink-0 h-[50px] flex flex-col justify-center">
                                            <h3 className="line-clamp-1 text-xs font-bold text-white leading-tight mb-0.5" title={entry.title}>
                                                {entry.title}
                                            </h3>
                                            {entry.subtitle && (
                                                <p className="line-clamp-1 text-[10px] text-white/60 font-medium" title={entry.subtitle}>
                                                    {entry.subtitle}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {stats.recentlyPlayed.length === 0 && (
                                    <div className="w-full flex h-40 items-center justify-center text-white/30">
                                        No history yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {selectedEntry && (
                <HistoryModal
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                />
            )}
        </div>
    );
}

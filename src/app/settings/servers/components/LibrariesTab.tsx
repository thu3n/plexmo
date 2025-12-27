"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SettingsSection, SettingsCard } from "../../components/SettingsComponents";
import { useLanguage } from "@/components/LanguageContext";
import { Folder, RefreshCw, Eye } from "lucide-react";
import clsx from "clsx";
import type { LibrarySection } from "@/lib/plex";
import type { PublicServer } from "@/lib/servers";

const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed");
    return response.json();
};

export function LibrariesTab() {
    const { t } = useLanguage();
    const { data: dashboardData, isLoading: dashboardLoading } = useSWR<{ libraries: LibrarySection[] }>("/api/dashboard", fetchJson);
    const { data: serversData } = useSWR<{ servers: PublicServer[] }>("/api/servers", fetchJson);
    const { data: jobsData, mutate: mutateJobs } = useSWR<{ jobs: any[] }>("/api/jobs", fetchJson, { refreshInterval: 2000 });

    const activeListSync = jobsData?.jobs?.find(j => j.type === 'sync_all_library_lists' && ['running', 'pending'].includes(j.status));

    const handleGlobalSync = async () => {
        if (activeListSync) return;
        try {
            await fetch("/api/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: 'sync_all_library_lists' }),
            });
            mutateJobs();
        } catch { }
    };

    const [filterServerId, setFilterServerId] = useState("");

    const libraries = dashboardData?.libraries ?? [];

    const displayGroups = (() => {
        let groups: { serverId: string; serverName: string; libs: LibrarySection[] }[] = [];
        if (filterServerId) {
            const filtered = libraries.filter(l => l.serverId === filterServerId);
            const serverName = serversData?.servers?.find(s => s.id === filterServerId)?.name || "Unknown";
            if (filtered.length > 0) groups.push({ serverId: filterServerId, serverName, libs: filtered });
        } else {
            const grouped = libraries.reduce((acc, lib) => {
                const serverId = lib.serverId || "unknown";
                if (!acc[serverId]) {
                    const sName = serversData?.servers?.find(s => s.id === serverId)?.name || lib.serverName || "Unknown";
                    acc[serverId] = { serverId: serverId, serverName: sName, libs: [] };
                }
                acc[serverId].libs.push(lib);
                return acc;
            }, {} as Record<string, { serverId: string; serverName: string; libs: LibrarySection[] }>);
            groups = Object.values(grouped);
        }
        return groups;
    })();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SettingsSection
                title={t("settings.libraries")}
                description={t("settings.librariesDesc")}
            >
                {/* Filters */}
                {serversData?.servers && serversData.servers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-8">
                        <button
                            onClick={() => setFilterServerId("")}
                            className={clsx(
                                "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                !filterServerId
                                    ? "bg-white text-slate-900 border-white shadow-lg"
                                    : "bg-white/5 border-white/5 text-white/50 hover:text-white hover:bg-white/10"
                            )}
                        >
                            ALL SERVERS
                        </button>
                        {serversData.servers.map(server => (
                            <button
                                key={server.id}
                                onClick={() => setFilterServerId(server.id === filterServerId ? "" : server.id)}
                                className={clsx(
                                    "px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                                    server.id === filterServerId
                                        ? "text-white border-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                        : "bg-white/5 border-white/5 text-white/50 hover:text-white hover:bg-white/10"
                                )}
                            >
                                {server.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                {dashboardLoading ? (
                    <div className="space-y-8">
                        {[1, 2].map(i => (
                            <div key={i} className="space-y-4">
                                <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {[1, 2, 3].map(j => <div key={j} className="h-32 rounded-3xl bg-white/5 animate-pulse" />)}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : displayGroups.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center">
                        <p className="text-white/50 mb-6">No libraries found. Connect a server first.</p>
                        <button
                            onClick={handleGlobalSync}
                            disabled={!!activeListSync}
                            className={clsx(
                                "px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 mx-auto transition-colors",
                                activeListSync
                                    ? "bg-amber-500/10 text-amber-500 cursor-default"
                                    : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                            )}
                        >
                            <RefreshCw className={clsx("w-5 h-5", activeListSync && "animate-spin")} />
                            {activeListSync ? "Syncing Libraries..." : "Sync Libraries"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {displayGroups.map(group => (
                            <div key={group.serverId}>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                    <h3 className="text-lg font-bold text-white/80 uppercase tracking-widest">{group.serverName}</h3>
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {group.libs.map(lib => {
                                        const activeJob = jobsData?.jobs?.find(j => j.targetId === lib.key && j.type === 'sync_library' && (j.status === 'running' || j.status === 'pending'));

                                        const handleSync = async () => {
                                            if (activeJob) return;
                                            try {
                                                await fetch('/api/jobs', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ type: 'sync_library', libraryKey: lib.key, serverId: lib.serverId })
                                                });
                                                mutateJobs();
                                            } catch { }
                                        };

                                        return (
                                            <SettingsCard key={lib.key} className="flex flex-col justify-between group/card">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover/card:bg-indigo-500 group-hover/card:text-white transition-colors">
                                                        <Folder className="w-6 h-6" />
                                                    </div>
                                                    <span className="px-2 py-1 rounded-md bg-white/5 text-xs font-bold text-white/60">
                                                        {lib.count || 0} items
                                                    </span>
                                                </div>

                                                <div>
                                                    <h4 className="font-bold text-white mb-1 truncate" title={lib.title}>{lib.title}</h4>
                                                    <p className="text-xs text-white/40 capitalize">{lib.type}</p>
                                                </div>

                                                <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                                                    <Link
                                                        href={`/libraries/${lib.key}?server=${lib.serverId}`}
                                                        className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-white/70 hover:text-white flex items-center justify-center gap-2 transition-colors"
                                                    >
                                                        <Eye className="w-3 h-3" /> View
                                                    </Link>
                                                    <button
                                                        onClick={handleSync}
                                                        disabled={!!activeJob}
                                                        className={clsx(
                                                            "flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors",
                                                            activeJob
                                                                ? "bg-amber-500/10 text-amber-500 cursor-default"
                                                                : "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                                                        )}
                                                    >
                                                        <RefreshCw className={clsx("w-3 h-3", activeJob && "animate-spin")} />
                                                        {activeJob ? `${activeJob.progress}%` : "Sync"}
                                                    </button>
                                                </div>
                                                {activeJob && (
                                                    <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500/20">
                                                        <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${activeJob.progress}%` }} />
                                                    </div>
                                                )}
                                            </SettingsCard>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SettingsSection>
        </div>
    );
}

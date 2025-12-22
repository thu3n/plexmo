"use client";

import useSWR from "swr";
import { SettingsSection, SettingsCard } from "../components/SettingsComponents";
import { useLanguage } from "@/components/LanguageContext";
import { RefreshCw, Globe, List, CheckCircle, XCircle, Clock } from "lucide-react";
import clsx from "clsx";

const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed");
    return response.json();
};

export default function JobsSettingsPage() {
    const { t } = useLanguage();
    const { data, mutate, isLoading } = useSWR<{ jobs: any[] }>("/api/jobs", fetchJson, { refreshInterval: 2000 });

    const activeGlobalSync = data?.jobs?.find(j => j.type === 'sync_all_content' && ['running', 'pending'].includes(j.status));
    const activeListSync = data?.jobs?.find(j => j.type === 'sync_all_library_lists' && ['running', 'pending'].includes(j.status));

    const handleJob = async (type: string) => {
        if (type === 'sync_all_content' && !confirm("This will scan ALL content. Continue?")) return;
        try {
            await fetch("/api/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type }),
            });
            mutate();
        } catch { alert("Failed to start job"); }
    };

    return (
        <div className="space-y-8">
            <SettingsSection
                title={t("settings.jobs")}
                description="Monitor and trigger background synchronization tasks."
            >
                {/* Controls */}
                <div className="grid gap-6 md:grid-cols-2">
                    <SettingsCard className="border-l-4 border-emerald-500">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-emerald-500" />
                                    Global Content Sync
                                </h3>
                                <p className="text-sm text-white/50 mt-1">Deep scan of all items on all servers.</p>
                            </div>
                        </div>

                        <div className="mt-4">
                            {activeGlobalSync ? (
                                <div className="space-y-2 h-[52px] flex flex-col justify-center">
                                    <div className="flex justify-between text-xs font-bold text-emerald-400">
                                        <span>{activeGlobalSync.message || "Running..."}</span>
                                        <span>{activeGlobalSync.progress}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${activeGlobalSync.progress}%` }} />
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleJob('sync_all_content')}
                                    className="w-full h-[52px] rounded-xl bg-emerald-500/10 text-emerald-500 font-bold hover:bg-emerald-500 hover:text-white transition-all border border-emerald-500/20"
                                >
                                    Start Global Sync
                                </button>
                            )}
                        </div>
                    </SettingsCard>

                    <SettingsCard className="border-l-4 border-amber-500">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <List className="w-5 h-5 text-amber-500" />
                                    Sync Library Lists
                                </h3>
                                <p className="text-sm text-white/50 mt-1">Quick refresh of library definitions.</p>
                            </div>
                        </div>

                        <div className="mt-4">
                            {activeListSync ? (
                                <div className="space-y-2 h-[52px] flex flex-col justify-center">
                                    <div className="flex justify-between text-xs font-bold text-amber-500">
                                        <span>{activeListSync.message || "Running..."}</span>
                                        <span>{activeListSync.progress}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${activeListSync.progress}%` }} />
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleJob('sync_all_library_lists')}
                                    className="w-full h-[52px] rounded-xl bg-amber-500/10 text-amber-500 font-bold hover:bg-amber-500 hover:text-slate-900 transition-all border border-amber-500/20"
                                >
                                    Start List Sync
                                </button>
                            )}
                        </div>
                    </SettingsCard>
                </div>

                {/* History */}
                <div className="mt-8">
                    <h3 className="text-lg font-bold text-white mb-4">Job History</h3>
                    <div className="space-y-3">
                        {isLoading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />)
                        ) : data?.jobs.length === 0 ? (
                            <div className="p-8 text-center text-white/50 bg-white/5 rounded-2xl">No jobs recorded.</div>
                        ) : (
                            data?.jobs.map(job => (
                                <div key={job.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className={clsx(
                                        "p-2 rounded-full",
                                        job.status === 'completed' ? "bg-emerald-500/20 text-emerald-500" :
                                            job.status === 'failed' ? "bg-rose-500/20 text-rose-500" :
                                                "bg-amber-500/20 text-amber-500 animate-pulse"
                                    )}>
                                        {job.status === 'completed' ? <CheckCircle className="w-5 h-5" /> :
                                            job.status === 'failed' ? <XCircle className="w-5 h-5" /> :
                                                <RefreshCw className="w-5 h-5 animate-spin" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between">
                                            <h4 className="font-bold text-white capitalize">{job.type.replace(/_/g, ' ')}</h4>
                                            <span className="text-xs text-white/30 font-mono">{new Date(job.updatedAt).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <p className="text-xs text-white/50 truncate max-w-[300px]">{job.message || job.status}</p>
                                            {job.status === 'running' && <span className="text-xs font-bold text-amber-500">{job.progress}%</span>}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </SettingsSection >
        </div >
    );
}

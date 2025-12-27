"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Activity, Tv, X, ArrowLeft } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";


const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Snapshot = {
    count: number;
    timestamp: number;
    sessions: any[];
};

export default function StatisticsPage() {
    const { t } = useLanguage();
    const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
    const [isModalOpen, setIsModalOpen] = useState(false);

    const router = useRouter();

    const { data: snapshot } = useSWR<Snapshot>(
        `/api/statistics/concurrent?range=${range}`,
        fetcher
    );

    const maxConcurrentStreams = snapshot?.count || 0;
    const peakDate = snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleString() : null;

    return (
        <div className="container mx-auto p-6 space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 rounded-lg bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-colors"
                        aria-label="Go back"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                            {t("dashboard.statistics")}
                        </h1>
                        <p className="text-gray-400 mt-2">View historical data and usage metrics.</p>
                    </div>
                </div>
                <div className="flex bg-gray-900/50 p-1 rounded-lg border border-gray-800">
                    {(["24h", "7d", "30d"] as const).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${range === r
                                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                                }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </header>

            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-amber-500" />
                    <h2 className="text-xl font-semibold text-white">Watch Statistics</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button
                        onClick={() => snapshot?.count && setIsModalOpen(true)}
                        className="text-left bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-amber-500/50 hover:bg-gray-900/80 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-start justify-between relative z-10">
                            <div>
                                <p className="text-gray-400 text-sm font-medium mb-1">Most Concurrent Streams</p>
                                <p className="text-3xl font-bold text-white group-hover:text-amber-500 transition-colors">
                                    {maxConcurrentStreams}
                                </p>
                            </div>
                            <div className="bg-amber-500/10 p-2 rounded-lg group-hover:bg-amber-500/20 transition-colors">
                                <Tv className="w-5 h-5 text-amber-500" />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-4">
                            Peak in the last {range}
                        </p>
                        {peakDate && (
                            <p className="text-[10px] text-gray-600 mt-1 truncate">
                                {peakDate}
                            </p>
                        )}
                    </button>
                </div>
            </section>

            {/* Detail Modal */}
            {isModalOpen && snapshot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <div>
                                <h3 className="text-xl font-bold text-white">Peak Details</h3>
                                <p className="text-sm text-gray-400">{peakDate}</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            <div className="space-y-3">
                                {snapshot.sessions.map((session: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/5">
                                        <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                            {session.userThumb ? (
                                                <img src={session.userThumb} alt={session.user} className="h-full w-full object-cover" />
                                            ) : (
                                                <span className="text-xs font-bold text-white/50">
                                                    {session.user.substring(0, 2).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-white truncate">{session.user}</p>
                                            <p className="text-xs text-amber-400 truncate">{session.title}</p>
                                        </div>
                                        <div className="text-xs text-gray-500 shrink-0">
                                            {session.player}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/10 bg-white/5 rounded-b-2xl">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-full py-2 bg-white/10 hover:bg-white/15 text-white font-medium rounded-lg transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

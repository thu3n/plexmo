"use strict";
"use client";

import { useState, useEffect, useRef } from "react";
import { SettingsSection, SettingsCard } from "../components/SettingsComponents";
import { UploadCloud, Database, AlertTriangle, CheckCircle2, XCircle, Download, Server, ArrowRight, Loader2 } from "lucide-react";
import clsx from "clsx";

interface PlexmoServer {
    id: string;
    name: string;
    baseUrl: string;
    identifier?: string;
}

interface TautulliServerInfo {
    id: string;
    name: string;
    identifier?: string;
    type: 'standard' | 'fork';
    param: string | number;
}

interface Job {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    message?: string;
    itemsProcessed: number;
    totalItems: number;
}

export default function ImportSettingsPage() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);



    // API Import State
    const [step, setStep] = useState<'connect' | 'source_select' | 'mapping' | 'importing' | 'completed'>('connect');
    const [apiUrl, setApiUrl] = useState("");
    const [apiKey, setApiKey] = useState("");

    // Server Mapping Data
    const [sourceServers, setSourceServers] = useState<TautulliServerInfo[]>([]);
    const [tautulliServer, setTautulliServer] = useState<TautulliServerInfo | null>(null);
    const [plexmoServers, setPlexmoServers] = useState<PlexmoServer[]>([]);
    const [targetServerId, setTargetServerId] = useState<string>("");

    // Ignored Servers
    const [ignoredServers, setIgnoredServers] = useState<Set<string>>(new Set());

    const toggleIgnore = (serverId: string) => {
        setIgnoredServers(prev => {
            const next = new Set(prev);
            if (next.has(serverId)) {
                next.delete(serverId);
            } else {
                next.add(serverId);
            }
            return next;
        });
    };

    // Job Progress
    const [currentJob, setCurrentJob] = useState<Job | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // --- Cleanup ---
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // --- Export Handler ---
    const handleExport = async () => {
        try {
            const response = await fetch("/api/settings/export");
            if (!response.ok) throw new Error("Export failed");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `plexmo-backup-${new Date().toISOString().slice(0, 10)}.db`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export error:", error);
            alert("Failed to export database");
        }
    };



    // --- API Import Handlers ---

    // Step 1: Connect & Check
    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsProcessing(true);
        setStatus(null);

        try {
            // 1. Check Tautulli
            const checkRes = await fetch("/api/settings/import/tautulli/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: apiUrl, apiKey })
            });
            const checkData = await checkRes.json();
            if (!checkRes.ok) throw new Error(checkData.error || "Failed to connect to Tautulli");

            const foundServers = checkData.servers || [checkData.server]; // Fallback for old API if needed
            setSourceServers(foundServers);

            // 2. Fetch Local Servers
            const serversRes = await fetch("/api/servers");
            const serversData = await serversRes.json();
            if (!serversRes.ok) throw new Error(serversData.error || "Failed to fetch local servers");

            setPlexmoServers(serversData.servers || []);

            // Decision Logic
            // Always go to source_select (Bulk UI) for both single and multi-server
            if (foundServers.length > 0) {
                setStep('source_select');
            } else {
                throw new Error("No Tautulli servers found.");
            }

        } catch (err: any) {
            setStatus({ success: false, error: err.message });
        } finally {
            setIsProcessing(false);
        }
    };

    const selectSourceServer = (tServer: TautulliServerInfo, pServers: PlexmoServer[] = plexmoServers) => {
        setTautulliServer(tServer);

        // Attempt Auto-match
        const tIdentifier = tServer.identifier;
        const tName = tServer.name;

        const match = pServers.find((p: any) =>
            (tIdentifier && p.identifier === tIdentifier) || (p.name && tName && p.name.toLowerCase() === tName.toLowerCase())
        );

        if (match) {
            setTargetServerId(match.id);
        } else if (pServers.length > 0) {
            setTargetServerId(pServers[0].id);
        }

        setStep('mapping');
    };

    // Step 2: Start Import Job
    const handleStartImport = async () => {
        setIsProcessing(true);
        setStatus(null);

        try {
            // Build Mapping
            const mapping: { [key: string]: string } = {};
            sourceServers.forEach(s => {
                // Skip ignored servers
                if (ignoredServers.has(s.param.toString())) return;

                const match = plexmoServers.find(p => (s.identifier && p.identifier === s.identifier) || (p.name && s.name && p.name.toLowerCase() === s.name.toLowerCase()));
                if (match) {
                    mapping[s.param.toString()] = match.id;
                }
            });

            if (Object.keys(mapping).length === 0) {
                throw new Error("No servers could be mapped. Please ensure at least one server matches.");
            }

            const res = await fetch("/api/settings/import/tautulli/api", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: apiUrl, apiKey, serverMapping: mapping })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Failed to start import");

            // Start Polling
            setStep('importing');
            startPolling(data.jobId);

        } catch (err: any) {
            setStatus({ success: false, error: err.message });
            setIsProcessing(false);
        }
    };

    const startPolling = (jobId: string) => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        pollingRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                const data = await res.json();

                if (data.job) {
                    setCurrentJob(data.job);
                    if (data.job.status === 'completed' || data.job.status === 'failed') {
                        clearInterval(pollingRef.current!);
                        setStep('completed');
                        setIsProcessing(false);
                        if (data.job.status === 'completed') {
                            setStatus({ success: true, message: data.job.message || "Import Completed Successfully" });
                        } else {
                            setStatus({ success: false, error: data.job.message || "Import Job Failed" });
                        }
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 1000);
    };

    const resetApiImport = () => {
        setStep('connect');
        setStatus(null);
        setTautulliServer(null);
        setCurrentJob(null);
        if (pollingRef.current) clearInterval(pollingRef.current);
    }

    return (
        <div className="space-y-8 relative">


            <SettingsSection
                title="Data Management"
                description="Export your data for backup or import from other sources."
            >
                <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
                    <div className="space-y-6">

                        {/* Export Section */}
                        <SettingsCard>
                            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
                                <div className="flex gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                        <Download className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Export Backup</h3>
                                        <p className="text-sm text-white/50 mt-1">Download a full backup of your Plexmo database.</p>
                                    </div>
                                </div>
                                <button onClick={handleExport} className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 whitespace-nowrap">
                                    <Download className="w-4 h-4" /> Download Database
                                </button>
                            </div>
                        </SettingsCard>

                        {/* Import Section */}
                        <SettingsCard>
                            <div className="animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="flex gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                                        <Database className="w-6 h-6" />
                                    </div>
                                    <div className="min-w-0 w-full">
                                        <h3 className="text-lg font-bold text-white">Tautulli Import</h3>
                                        <p className="text-sm text-white/50 mt-1 mb-6">Import history directly from your Tautulli instance via API.</p>

                                        {/* API Import UI - Multi Step */}
                                        <div className="space-y-6">
                                            {step === 'connect' && (
                                                <form onSubmit={handleConnect} className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-white/70 uppercase mb-1.5">Tautulli URL</label>
                                                            <input type="url" required placeholder="http://192.168.1.50:8181" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50 transition-colors" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-white/70 uppercase mb-1.5">API Key</label>
                                                            <input type="text" required placeholder="Enter your Tautulli API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50 transition-colors font-mono" />
                                                        </div>
                                                    </div>
                                                    <button type="submit" disabled={isProcessing} className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 mt-2">
                                                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                                                        {isProcessing ? "Connecting..." : "Connect"}
                                                    </button>
                                                </form>
                                            )}

                                            {step === 'source_select' && (
                                                <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
                                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="h-10 w-10 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-500 font-bold shrink-0">
                                                                <Server className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-white text-lg">Server Mapping</h3>
                                                                <p className="text-white/50 text-sm">Review how your Tautulli servers map to Plexmo.</p>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {sourceServers.map((tServer, idx) => {
                                                                const tId = tServer.param.toString();
                                                                const isIgnored = ignoredServers.has(tId);
                                                                // Find Match
                                                                const match = plexmoServers.find(p => (tServer.identifier && p.identifier === tServer.identifier) || (p.name && tServer.name && p.name.toLowerCase() === tServer.name.toLowerCase()));

                                                                return (
                                                                    <div key={idx} className={clsx("flex items-center justify-between bg-black/30 p-3 rounded-lg border transition-all", isIgnored ? "border-white/5 opacity-50" : "border-white/5")}>
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/70">
                                                                                {tServer.name ? tServer.name.substring(0, 1) : "?"}
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-sm font-bold text-white">{tServer.name || "Unknown Server"}</div>
                                                                                <div className="text-xs text-white/40 font-mono">ID: {tServer.identifier === 'default' ? 'Default' : tServer.param}</div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-3">
                                                                            <ArrowRight className="w-4 h-4 text-white/20" />

                                                                            {isIgnored ? (
                                                                                <div className="flex items-center gap-2 text-white/40 bg-white/5 px-2 py-1 rounded text-xs border border-white/10">
                                                                                    <span className="font-bold">Ignored</span>
                                                                                </div>
                                                                            ) : match ? (
                                                                                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-xs border border-emerald-500/20">
                                                                                    <CheckCircle2 className="w-3 h-3" />
                                                                                    <span className="font-bold">{match.name}</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 px-2 py-1 rounded text-xs border border-rose-500/20">
                                                                                    <XCircle className="w-3 h-3" />
                                                                                    <span className="font-bold">Missing in Plexmo</span>
                                                                                </div>
                                                                            )}

                                                                            <button
                                                                                onClick={() => toggleIgnore(tId)}
                                                                                className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors ml-2"
                                                                                title={isIgnored ? "Include Server" : "Ignore Server"}
                                                                            >
                                                                                {isIgnored ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Validation Message */}
                                                    {sourceServers.filter(s => !ignoredServers.has(s.param.toString())).some(s => !plexmoServers.find(p => (s.identifier && p.identifier === s.identifier) || (p.name && s.name && p.name.toLowerCase() === s.name.toLowerCase()))) ? (
                                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3 items-start">
                                                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                                            <div className="text-sm text-amber-200">
                                                                <strong>Missing Servers Detected</strong>
                                                                <p className="opacity-80 mt-1 mb-2">Some servers in Tautulli were not found in Plexmo. It is highly recommended to add these servers to Plexmo before continuing to ensure correct metadata (posters, art).</p>
                                                                <p className="opacity-60 text-xs">If you proceed, history for missing servers will be skipped.</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex gap-3 items-center">
                                                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                                            <div className="text-sm text-emerald-200">
                                                                <strong>All Servers Mapped!</strong>
                                                                <p className="opacity-80 text-xs mt-1">Ready to import history from {sourceServers.length - ignoredServers.size} servers.</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={resetApiImport}
                                                            className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={handleStartImport}
                                                            className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                                                        >
                                                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                                                            Start Import
                                                        </button>
                                                    </div>
                                                </div>
                                            )}


                                            {(step === 'importing' || step === 'completed') && (
                                                <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
                                                    <div className="bg-black/30 border border-white/10 rounded-xl p-6 text-center">
                                                        {step === 'completed' && status?.success ? (
                                                            <div className="mb-4 flex justify-center"><div className="h-16 w-16 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500"><CheckCircle2 className="w-8 h-8" /></div></div>
                                                        ) : step === 'completed' && !status?.success ? (
                                                            <div className="mb-4 flex justify-center"><div className="h-16 w-16 bg-rose-500/20 rounded-full flex items-center justify-center text-rose-500"><XCircle className="w-8 h-8" /></div></div>
                                                        ) : (
                                                            <div className="mb-4 flex justify-center"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /></div>
                                                        )}

                                                        <h3 className="text-xl font-bold text-white mb-2">
                                                            {step === 'completed'
                                                                ? (status?.success ? "Import Complete!" : "Import Failed")
                                                                : "Importing History..."
                                                            }
                                                        </h3>

                                                        {currentJob && (
                                                            <div className="space-y-4">
                                                                <p className="text-white/60 text-sm">{currentJob.message}</p>

                                                                {/* Progress Bar */}
                                                                <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden relative">
                                                                    <div
                                                                        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-amber-600 to-amber-400 Transition-all duration-300 ease-out"
                                                                        style={{ width: `${currentJob.progress}%` }}
                                                                    />
                                                                </div>
                                                                <div className="flex justify-between text-xs text-white/50 font-mono">
                                                                    <span>{currentJob.itemsProcessed} / {currentJob.totalItems || '?'} items</span>
                                                                    <span>{currentJob.progress}%</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {step === 'completed' && (
                                                        <button
                                                            onClick={resetApiImport}
                                                            className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
                                                        >
                                                            Start New Import
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                        </div>

                                    </div>
                                </div>
                            </div>
                        </SettingsCard>

                        {/* Status Message (Only show for non-API flow or unexpected errors, API flow has its own UI) */}
                        {status && step === 'connect' && (
                            <div className={clsx(
                                "p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-2",
                                status.success
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            )}>
                                {status.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
                                <div className="min-w-0 break-words">
                                    <h4 className="font-bold text-sm">{status.success ? "Success" : "Error"}</h4>
                                    <p className="text-sm opacity-80 mt-1">{status.message || status.error}</p>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Sidebar / Info Column */}
                    <div></div>
                </div >
            </SettingsSection >
        </div >
    );
}

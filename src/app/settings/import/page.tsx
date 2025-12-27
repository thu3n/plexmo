"use strict";
"use client";

import { useState } from "react";
import { SettingsSection, SettingsCard } from "../components/SettingsComponents";
import { UploadCloud, Database, AlertTriangle, CheckCircle2, XCircle, Download } from "lucide-react";
import clsx from "clsx";

export default function ImportSettingsPage() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
    
    // Warning Modal State
    const [showWarning, setShowWarning] = useState(false);

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

    // --- Import Handlers ---
    
    // 1. Initial click shows warning
    const handleTautulliImportClick = (e: React.FormEvent) => {
        e.preventDefault();
        setShowWarning(true);
    };

    // 2. Actual execution after confirmation
    const executeImport = async () => {
        setShowWarning(false); // Close modal
        setIsProcessing(true);
        setStatus(null);
        try {
            const res = await fetch("/api/settings/import/tautulli", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Import failed");
            setStatus({ success: true, message: data.message });
        } catch (err: any) {
            setStatus({ success: false, error: err.message });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-8 relative"> 
            {/* Warning Modal */}
            {showWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
                         {/* Background Glow */}
                         <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="flex flex-col items-center text-center gap-4 relative z-10">
                            <div className="h-16 w-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-2">
                                <AlertTriangle className="w-8 h-8 text-amber-500" />
                            </div>
                            
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Important Warning</h3>
                                <p className="text-white/70 text-sm leading-relaxed">
                                    Have you named your Plexmo servers <strong className="text-white">exactly</strong> the same as in Tautulli?
                                </p>
                                <p className="text-white/50 text-xs mt-3 bg-white/5 p-3 rounded-lg border border-white/5">
                                    Exact name matching is required for the import to correctly map your history to the right server.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 w-full mt-2">
                                <button 
                                    onClick={() => setShowWarning(false)}
                                    className="px-4 py-3 rounded-xl font-bold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={executeImport}
                                    className="px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                                >
                                    Yes, Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                        <p className="text-sm text-white/50 mt-1">
                                            Download a full backup of your Plexmo database.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleExport}
                                    className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 whitespace-nowrap"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Database
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
                                        <p className="text-sm text-white/50 mt-1 mb-6">
                                            Import history from a <code className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono text-xs">tautulli.db</code> file.
                                        </p>

                                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                                            <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-2">
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                Instructions
                                            </h4>
                                            <ol className="list-decimal list-inside space-y-1 text-sm text-white/60">
                                                <li>Locate your Tautulli database file.</li>
                                                <li>Copy it to <code className="text-white bg-black/30 px-1 rounded break-all">config/import/Tautulli/tautulli.db</code></li>
                                                <li>Click the button below.</li>
                                            </ol>
                                        </div>

                                        <form onSubmit={handleTautulliImportClick}>
                                            <button
                                                type="submit"
                                                disabled={isProcessing}
                                                className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                                            >
                                                {isProcessing ? <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" /> : <UploadCloud className="w-5 h-5" />}
                                                {isProcessing ? "Processing Database..." : "Start Import"}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </SettingsCard>

                        {/* Status Message */}
                        {status && (
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
                    {/* Sidebar / Info Column (optional, left empty for now as per design) */}
                    <div></div>
                </div>
            </SettingsSection>
        </div>
    );
}


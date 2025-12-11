"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageContext";

type User = {
    id: string;
    username: string;
    email: string;
    thumb: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function UserMenu() {
    const { t } = useLanguage();
    const router = useRouter();
    const { data, error } = useSWR<{ user: User }>("/api/auth/me", fetcher);
    const { data: maintenanceData, mutate: mutateMaintenance } = useSWR<{ active: boolean }>("/api/auth/maintenance", fetcher, { refreshInterval: 10000 });
    const isMaintenanceActive = maintenanceData?.active;

    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const user = data?.user;

    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
    const [maintenanceError, setMaintenanceError] = useState("");

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login"; // Full reload to clear state
    };

    const handleToggleAuth = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        // Validation only for DISABLING
        const requiredWord = t("menu.confirmInput");
        if (!isMaintenanceActive && confirmText.toLowerCase() !== requiredWord) return;

        setIsLoadingMaintenance(true);
        setMaintenanceError("");
        try {
            const body = isMaintenanceActive
                ? { enabled: true }
                : { duration: 300 };

            const res = await fetch("/api/auth/maintenance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error("Kunde inte ändra status");

            await mutateMaintenance(); // Refresh status immediately
            setConfirmText("");
            setIsMaintenanceModalOpen(false);
            setIsOpen(false);

            if (isMaintenanceActive) {
                alert(t("menu.authEnabled"));
                window.location.reload(); // Reload to ensure full security state
            } else {
                alert(t("menu.authDisabled"));
            }

        } catch (err) {
            console.error("Auth Toggle Failed:", err);
            setMaintenanceError(t("menu.error") + ": " + (err instanceof Error ? err.message : t("common.unknown")));
            if (isMaintenanceActive) {
                alert(t("menu.errorTitle") + ": " + (err instanceof Error ? err.message : t("common.unknown")));
            }
        } finally {
            setIsLoadingMaintenance(false);
        }
    };

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    if (!user) return null;

    return (
        <>
            <div className="relative" ref={menuRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 pl-2 pr-3 py-1.5 transition hover:bg-white/10"
                >
                    <img
                        src={user.thumb}
                        alt={user.username}
                        className="h-8 w-8 rounded-full bg-white/10 object-cover"
                    />
                    <span className="hidden text-sm font-medium text-white sm:block">
                        {user.username}
                    </span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-5 w-5 text-white/50 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-white/10 bg-slate-900 shadow-2xl ring-1 ring-black/5 focus:outline-none z-50">
                        <div className="border-b border-white/10 p-4">
                            <p className="text-sm font-medium text-white">{user.username}</p>
                            <p className="truncate text-xs text-white/50">{user.email}</p>
                        </div>
                        <div className="p-2 space-y-1">
                            {/* Navigation Items */}
                            <button
                                onClick={() => { setIsOpen(false); router.push("/history"); }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                                </svg>
                                {t("dashboard.history")}
                            </button>
                            <button
                                onClick={() => { setIsOpen(false); router.push("/settings"); }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.047 7.047 0 010-2.228l-1.267-1.113a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                </svg>
                                {t("dashboard.settings")}
                            </button>

                            <div className="my-1 h-px bg-white/5" />
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setIsMaintenanceModalOpen(true);
                                }}
                                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isMaintenanceActive
                                    ? "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                    : "text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                                    }`}
                            >
                                {isMaintenanceActive ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm-2 4a2 2 0 114 0v2H8V6z" clipRule="evenodd" />
                                        </svg>
                                        {t("menu.enableAuth")}
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                        </svg>
                                        {t("menu.disableAuth")}
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                                    <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
                                </svg>
                                {t("common.logout") || "Logga ut"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Maintenance Warning Modal */}
            {isMaintenanceModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className={`w-full max-w-md rounded-2xl border ${isMaintenanceActive ? "border-emerald-500/30" : "border-rose-500/30"} bg-slate-900 p-6 shadow-2xl`}>
                        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${isMaintenanceActive ? "bg-emerald-500/20 text-emerald-500" : "bg-rose-500/20 text-rose-500"}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        </div>
                        <h3 className="mb-2 text-xl font-bold text-white">
                            {isMaintenanceActive ? t("menu.enableAuthTitle") : t("menu.disableAuthTitle")}
                        </h3>
                        <p className="mb-6 text-sm text-slate-300 leading-relaxed">
                            {isMaintenanceActive
                                ? t("menu.enableAuthDesc")
                                : <span dangerouslySetInnerHTML={{ __html: t("menu.disableAuthDesc") }} />
                            }
                        </p>

                        <form onSubmit={handleToggleAuth}>
                            {!isMaintenanceActive && (
                                <>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/50">
                                        {t("menu.confirmAction")}
                                    </label>
                                    <input
                                        type="text"
                                        value={confirmText}
                                        onChange={(e) => setConfirmText(e.target.value)}
                                        placeholder={t("menu.confirmPlaceholder", { word: t("menu.confirmInput") })}
                                        className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/20 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 mb-4"
                                        autoFocus
                                    />
                                </>
                            )}

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMaintenanceModalOpen(false);
                                        setConfirmText("");
                                        setMaintenanceError("");
                                    }}
                                    className="flex-1 rounded-lg bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                                >
                                    {t("menu.cancel")}
                                </button>
                                <button
                                    type="submit"
                                    disabled={(!isMaintenanceActive && confirmText.toLowerCase() !== t("menu.confirmInput")) || isLoadingMaintenance}
                                    className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${isMaintenanceActive ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
                                        }`}
                                >
                                    {isLoadingMaintenance ? t("menu.processing") : t("menu.confirm")}
                                </button>
                            </div>
                            {maintenanceError && <p className="mt-2 text-center text-xs text-rose-400">{maintenanceError}</p>}
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

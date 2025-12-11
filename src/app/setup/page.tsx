"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageContext";
import { OnboardingSteps } from "@/components/OnboardingSteps";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

import { type PlexResource, flattenResources } from "@/lib/plex-utils";

export default function OnboardingPage() {
    const { t } = useLanguage();
    const router = useRouter();

    // -- AUTH STATE --
    const { data: userData, mutate: mutateUser, error: userError } = useSWR("/api/auth/me", fetcher);
    const isAuthenticated = userData && userData.user;

    // Derived step: If not auth -> 1, If auth -> 2
    const currentStep = isAuthenticated ? 2 : 1;

    // -- LOGIN STATE --
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [loginError, setLoginError] = useState("");

    // -- CONFIG STATE --
    const [servers, setServers] = useState<PlexResource[]>([]);
    const [isLoadingServers, setIsLoadingServers] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);

    const [selectedServerIdentifier, setSelectedServerIdentifier] = useState("");
    const [hostname, setHostname] = useState("http://");
    const [port, setPort] = useState("32400");
    const [useSsl, setUseSsl] = useState(false);
    const [token, setToken] = useState("");


    // --- LOGIN HANDLER ---
    const handleLogin = async () => {
        setIsAuthenticating(true);
        setLoginError("");

        // 1. Open Popup Immediately (to avoid Safari blocker)
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
            "",
            "PlexAuth",
            `width=${width},height=${height},left=${left},top=${top}`
        );

        if (popup) {
            popup.document.body.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;font-family:sans-serif;"><h3>${t("login.authenticating")}...</h3></div>`;
        }

        try {
            // 2. Get PIN
            const res = await fetch("/api/auth/plex");
            if (!res.ok) throw new Error("Failed to start authentication");

            const { code, id, authUrl, clientIdentifier } = await res.json();

            // 3. Redirect Popup
            if (popup) {
                popup.location.href = authUrl;
            } else {
                throw new Error(t("login.popupBlocked"));
            }

            // 3. Poll for Success
            const pollInterval = setInterval(async () => {
                if (popup?.closed) {
                    clearInterval(pollInterval);
                    setIsAuthenticating(false);
                    return;
                }

                try {
                    const checkRes = await fetch("/api/auth/plex", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ pinId: id, clientIdentifier }),
                    });

                    if (checkRes.ok) {
                        clearInterval(pollInterval);
                        popup?.close();
                        // Success! Re-fetch user to update state and move to step 2
                        await mutateUser();
                    } else if (checkRes.status === 403) {
                        // Owned check failed
                        clearInterval(pollInterval);
                        popup?.close();
                        const errData = await checkRes.json();
                        setLoginError(errData.error || t("login.accessDenied"));
                        setIsAuthenticating(false);
                    }
                } catch (e) {
                    // Ignore polling errors
                }
            }, 2000);

        } catch (err: any) {
            console.error(err);
            setLoginError(t("login.error"));
            setIsAuthenticating(false);
        }
    };


    // --- CONFIG HANDLERS ---
    const fetchServers = async () => {
        setIsLoadingServers(true);
        setConfigError(null);
        try {
            const res = await fetch("/api/plex/resources");

            if (res.status === 401) {
                // Should not happen if we are on Step 2, but just in case
                await mutateUser(); // Update auth state
                return;
            }

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Error ${res.status}: ${text}`);
            }

            const data = await res.json();
            setServers(data.servers || []);
        } catch (err: any) {
            console.error(err);
            setConfigError(err.message || "Could not load servers. Please try again.");
        } finally {
            setIsLoadingServers(false);
        }
    };

    const flatConnections = flattenResources(servers);

    const handleSelectConnection = (connectionId: string) => {
        const conn = flatConnections.find((c) => c.id === connectionId);
        if (!conn) return;

        setSelectedServerIdentifier(conn.id); // Use the connection ID now
        const uri = conn.uri;
        setToken(conn.token);

        try {
            const url = new URL(uri);
            setHostname(`${url.protocol}//${url.hostname}`);
            setPort(url.port || (url.protocol === "https:" ? "443" : "80"));
            setUseSsl(url.protocol === "https:");
        } catch (e) {
            // Fallback if parsing fails (unlikely from API)
            setHostname(uri);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        setConfigError(null);

        let baseUrl = hostname.replace(/\/$/, "");
        if (port && !baseUrl.includes(`:${port}`)) {
            baseUrl = `${baseUrl}:${port}`;
        }

        try {
            const res = await fetch("/api/servers/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    baseUrl,
                    token,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Testet misslyckades");

            setTestResult({ success: true, message: data.message || "Anslutning lyckades!" });
        } catch (err) {
            setTestResult({ success: false, message: err instanceof Error ? err.message : "Testet misslyckades" });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setConfigError(null);

        let baseUrl = hostname.replace(/\/$/, "");
        if (port && !baseUrl.includes(`:${port}`)) {
            baseUrl = `${baseUrl}:${port}`;
        }

        try {
            const res = await fetch("/api/servers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: servers.find(s => s.clientIdentifier === selectedServerIdentifier)?.name || "Plex Server",
                    baseUrl: baseUrl,
                    token: token,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to save server.");
            }

            router.push("/");
        } catch (err: any) {
            setConfigError(err.message || "Failed to connect server");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-20 bg-slate-950 px-4 text-white font-sans relative overflow-hidden">
            {/* Background Gradients */}
            <div className="pointer-events-none absolute inset-0 text-amber-500/5">
                <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M0 40L40 0H20L0 20M40 40V20L20 40" stroke="currentColor" strokeWidth="2" fill="none" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                </svg>
            </div>
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="relative z-10 w-full max-w-2xl">
                <div className="mb-6 text-center">
                    <h1 className="text-3xl font-bold text-white mb-2">{t("onboarding.title")}</h1>
                    <p className="text-white/60">{t("onboarding.subtitle")}</p>
                </div>

                <OnboardingSteps currentStep={currentStep} />

                <div className="bg-slate-900 border border-white/10 rounded-xl p-8 shadow-2xl backdrop-blur-sm">

                    {currentStep === 1 && (
                        /* --- STEP 1: LOGIN --- */
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="mb-6 rounded-3xl bg-amber-500 p-4 shadow-lg shadow-amber-500/20">
                                <svg className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">{t("login.title")}</h2>
                            <p className="text-slate-400 mb-8 max-w-xs text-center">
                                {t("login.subtitle") || "Sign in with your Plex account to get started."}
                            </p>

                            {loginError && (
                                <div className="mb-6 w-full rounded-lg bg-rose-500/10 p-3 text-center text-sm text-rose-400 border border-rose-500/20">
                                    {loginError}
                                </div>
                            )}

                            <button
                                onClick={handleLogin}
                                disabled={isAuthenticating}
                                className="group relative w-full max-w-xs overflow-hidden rounded-xl bg-[#e5a00d] px-6 py-3.5 font-bold text-white shadow-lg shadow-amber-900/20 transition-all hover:bg-[#d4940c] hover:scale-[1.02] hover:shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                            >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    {isAuthenticating ? (
                                        <>
                                            <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            {t("login.authenticating")}...
                                        </>
                                    ) : (
                                        <>
                                            {t("login.signInWithPlex")}
                                            <svg className="h-5 w-5 opacity-70 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                            </svg>
                                        </>
                                    )}
                                </span>
                            </button>
                        </div>
                    )}

                    {currentStep === 2 && (
                        /* --- STEP 2: CONFIGURE --- */
                        <>
                            {/* Info Box */}
                            <div className="mb-8 flex gap-4 rounded-lg bg-indigo-500/10 p-4 border border-indigo-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm text-indigo-200/90 leading-relaxed">
                                    {t("onboarding.form.serverPlaceholder")}
                                </p>
                            </div>

                            <form onSubmit={handleSave} className="space-y-6">
                                {/* Available Servers Dropdown row */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white/70">{t("session.server")}</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <select
                                                value={selectedServerIdentifier}
                                                onChange={(e) => handleSelectConnection(e.target.value)}
                                                disabled={servers.length === 0}
                                                className="w-full appearance-none rounded-lg border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder-white/30 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                                            >
                                                <option value="">{t("onboarding.form.selectServer")}</option>
                                                {flatConnections.map(conn => (
                                                    <option key={conn.id} value={conn.id}>
                                                        {conn.name} ({conn.uri}) - {conn.isLocal ? "Local" : "Remote"}
                                                    </option>
                                                ))}
                                            </select>
                                            {/* Chevron */}
                                            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/50">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={fetchServers}
                                            disabled={isLoadingServers}
                                            className="flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                                            title={t("onboarding.form.loadServers")}
                                        >
                                            {isLoadingServers ? (
                                                <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31a7 7 0 00-11.712 3.138.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311h-2.433a.75.75 0 000 1.5h4.242z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-sm font-medium text-white/70">{t("onboarding.form.hostname")} *</label>
                                        <input
                                            type="text"
                                            value={hostname}
                                            onChange={(e) => setHostname(e.target.value)}
                                            className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder-white/30 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            placeholder="http://127.0.0.1"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-white/70">{t("onboarding.form.port")} *</label>
                                        <input
                                            type="text"
                                            value={port}
                                            onChange={(e) => setPort(e.target.value)}
                                            className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder-white/30 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            placeholder="32400"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="relative inline-flex items-center cursor-pointer" onClick={() => setUseSsl(!useSsl)}>
                                        <div className={`w-11 h-6 rounded-full transition-colors ${useSsl ? 'bg-amber-500' : 'bg-white/10'}`}></div>
                                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${useSsl ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                    <span className="text-sm text-white/70">{t("onboarding.form.useSsl")}</span>
                                    <span className="ml-auto inline-flex items-center rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-400 ring-1 ring-inset ring-rose-500/20">
                                        Advanced
                                    </span>
                                </div>

                                {/* Testing Section */}
                                <div className="flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={handleTestConnection}
                                        disabled={isTesting || !hostname}
                                        className="w-full rounded-lg bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"
                                    >
                                        {isTesting ? "Testing..." : (t("onboarding.form.verify") || "Verify Connection")}
                                    </button>

                                    {testResult && (
                                        <div className={`rounded-lg p-3 text-sm border ${testResult.success ? "bg-green-500/20 text-green-200 border-green-500/30" : "bg-rose-500/20 text-rose-200 border-rose-500/30"}`}>
                                            {testResult.message}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="w-full rounded-lg bg-[#e5a00d] px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-[#d4940c] hover:shadow-lg hover:shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {isSaving ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <svg className="h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                {t("onboarding.form.save")}
                                            </div>
                                        ) : (
                                            t("onboarding.form.save")
                                        )}
                                    </button>
                                    {configError && (
                                        <p className="mt-4 text-center text-sm text-rose-400">{configError}</p>
                                    )}
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

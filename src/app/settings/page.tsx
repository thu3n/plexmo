"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { PublicServer } from "@/lib/servers";
import type { LibrarySection, PlexUser, SessionSummary } from "@/lib/plex";
import { type PlexResource, flattenResources } from "@/lib/plex-utils";
import { ServerCard } from "@/components/ServerCard";
import { AddServerCard } from "@/components/AddServerCard";
import { useLanguage } from "@/components/LanguageContext";

type ServersResponse = {
    servers: PublicServer[];
};

type DashboardResponse = {
    libraries: LibrarySection[];
    summary: SessionSummary;
};

type UsersResponse = {
    users: (PlexUser & { isImported?: boolean })[];
};

type AllowedUser = {
    id: string;
    email: string;
    username: string | null;
    createdAt: string;
};

type AccessResponse = {
    users: AllowedUser[];
};

const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        let detail = "";
        try {
            const parsed = await response.json();
            detail = parsed?.error || "";
        } catch {
            detail = await response.text();
        }
        throw new Error(detail || "Misslyckades att hämta data");
    }
    return response.json() as Promise<T>;
};

export default function SettingsPage() {
    const { t, language, setLanguage } = useLanguage();
    const [activeTab, setActiveTab] = useState<"general" | "servers" | "libraries" | "users" | "access">("general");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingServer, setEditingServer] = useState<PublicServer | null>(null);

    // Form State
    const [formName, setFormName] = useState("");
    const [formUrl, setFormUrl] = useState("");
    const [formToken, setFormToken] = useState("");
    const [formColor, setFormColor] = useState("");
    const [submitError, setSubmitError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Test Connection State
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Sorting & Filtering State
    const [sortBy, setSortBy] = useState<"name" | "status">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [filterServerId, setFilterServerId] = useState<string>("");
    const [formAppName, setFormAppName] = useState("");

    // Access State
    const [newUserEmail, setNewUserEmail] = useState("");
    const [isAddingUser, setIsAddingUser] = useState(false);

    // Auto-Discovery State (Add Server)
    const [discoveryMode, setDiscoveryMode] = useState<"auto" | "manual">("auto");
    const [fetchedServers, setFetchedServers] = useState<PlexResource[]>([]);
    const [discoveryToken, setDiscoveryToken] = useState<string>(""); // Isolated token for adding servers
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isLoadingResources, setIsLoadingResources] = useState(false);

    const {
        data: serversData,
        error: serversError,
        isLoading: serversLoading,
        mutate: mutateServers,
    } = useSWR<ServersResponse>("/api/servers", fetchJson);

    const {
        data: dashboardData,
        isLoading: dashboardLoading,
    } = useSWR<DashboardResponse>("/api/dashboard", fetchJson);

    const {
        data: usersData,
        isLoading: usersLoading,
        mutate: mutateUsers,
    } = useSWR<UsersResponse>(activeTab === "users" ? "/api/users" : null, fetchJson);

    const {
        data: settingsData,
        mutate: mutateSettings,
    } = useSWR<Record<string, string>>(activeTab === "general" ? "/api/settings" : null, fetchJson);

    const {
        data: accessData,
        mutate: mutateAccess,
        isLoading: isAccessLoading
    } = useSWR<AccessResponse>(activeTab === "access" ? "/api/settings/access" : null, fetchJson);

    useEffect(() => {
        if (settingsData?.["APP_NAME"]) {
            setFormAppName(settingsData["APP_NAME"]);
        } else {
            setFormAppName("Plexmo");
        }
    }, [settingsData]);

    const libraries = dashboardData?.libraries ?? [];
    const users = usersData?.users ?? [];

    const filteredUsers = users.filter(user => {
        if (!filterServerId) return true;
        const server = serversData?.servers.find(s => s.id === filterServerId);
        return server ? user.serverName === server.name : true;
    });

    const sortedUsers = [...filteredUsers].sort((a, b) => {
        let diff = 0;
        if (sortBy === "status") {
            // Sort by imported status (true first)
            if (a.isImported === b.isImported) {
                // Secondary sort by name
                diff = a.title.localeCompare(b.title);
            } else {
                diff = (a.isImported ? -1 : 1);
            }
        } else {
            // Sort by name
            diff = a.title.localeCompare(b.title);
        }
        return sortOrder === "asc" ? diff : -diff;
    });

    const handleOpenAdd = () => {
        setEditingServer(null);
        setFormName("");
        setFormUrl("");
        setFormToken("");
        setFormColor("");
        setSubmitError("");
        setTestResult(null);
        setDiscoveryMode("auto");
        setFetchedServers([]);
        setDiscoveryToken(""); // Reset discovery token
        setIsModalOpen(true);
    };

    const handleOpenEdit = (server: PublicServer) => {
        setEditingServer(server);
        setFormName(server.name);
        setFormUrl(server.baseUrl);
        setFormToken(server.maskedToken || "");
        setFormColor(server.color || "");
        setSubmitError("");
        setTestResult(null);
        setDiscoveryMode("manual"); // Editing is always manual
        setIsModalOpen(true);
    };

    // ISOLATED AUTH (Popup Flow)
    const handlePlexSignIn = async () => {
        setIsAuthenticating(true);
        setSubmitError("");
        try {
            // 1. Get PIN
            const res = await fetch("/api/auth/plex");
            if (!res.ok) throw new Error("Failed to start authentication");

            const { code, id, authUrl, clientIdentifier } = await res.json();

            // 2. Open Popup
            const width = 600;
            const height = 700;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;

            const popup = window.open(
                authUrl,
                "PlexAuth",
                `width=${width},height=${height},left=${left},top=${top}`
            );

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
                        body: JSON.stringify({
                            pinId: id,
                            clientIdentifier,
                            mode: "discovery" // Request token ONLY, no session
                        }),
                    });

                    if (checkRes.ok) {
                        clearInterval(pollInterval);
                        popup?.close();
                        const data = await checkRes.json();
                        setDiscoveryToken(data.token);
                        setIsAuthenticating(false);
                        // Auto-fetch resources once we have the token
                        fetchPlexResources(data.token);

                    } else if (checkRes.status === 403 || (checkRes.status !== 401 && checkRes.status !== 200)) {
                        // Error or denied
                        clearInterval(pollInterval);
                        popup?.close();
                        setSubmitError(t("login.error"));
                        setIsAuthenticating(false);
                    }
                } catch (e) {
                    // Ignore polling errors
                }
            }, 2000);
        } catch (err) {
            setSubmitError(t("login.error"));
            setIsAuthenticating(false);
        }
    };

    const fetchPlexResources = async (tokenOverride?: string) => {
        const tokenToUse = tokenOverride || discoveryToken;
        if (!tokenToUse) return;

        setIsLoadingResources(true);
        setSubmitError("");
        try {
            const res = await fetch("/api/plex/resources", {
                headers: {
                    "X-Plex-Token": tokenToUse
                }
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Kunde inte hämta servrar");
            }
            const data = await res.json();
            setFetchedServers(data.servers || []);
        } catch (err: any) {
            setSubmitError(err.message || "Misslyckades att hämta servrar från Plex");
        } finally {
            setIsLoadingResources(false);
        }
    };

    const flatConnections = flattenResources(fetchedServers);

    const handleSelectConnection = (connectionId: string) => {
        const conn = flatConnections.find((c) => c.id === connectionId);
        if (!conn) return;

        setFormName(conn.name);
        setFormUrl(conn.uri);
        setFormToken(conn.token);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setEditingServer(null);
        setTestResult(null);
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/servers/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    baseUrl: formUrl,
                    token: formToken,
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitError("");

        try {
            if (editingServer) {
                // UPDATE
                const payload: Record<string, string> = {
                    name: formName,
                    baseUrl: formUrl,
                    color: formColor,
                };
                if (!formToken.includes("…")) {
                    payload.token = formToken;
                }
                const res = await fetch(`/api/servers/${editingServer.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error(t("settings.saveError"));
            } else {
                // CREATE
                const res = await fetch("/api/servers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: formName,
                        baseUrl: formUrl,
                        token: formToken,
                        color: formColor,
                    }),
                });
                if (!res.ok) throw new Error(t("settings.saveError"));
            }
            await mutateServers();
            handleClose();
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : t("common.error"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteServer = async (id: string) => {
        if (!confirm(t("settings.confirmDelete"))) return;
        try {
            await fetch(`/api/servers/${id}`, { method: "DELETE" });
            await mutateServers();
        } catch (err) {
            alert(t("settings.deleteError"));
        }
    };

    const handleImportUsers = async () => {
        if (!users.length) return;
        setIsImporting(true);
        try {
            await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ users }),
            });
            await mutateUsers();
            alert(t("settings.importSuccess"));
        } catch (err) {
            alert(t("settings.importError"));
        } finally {
            setIsImporting(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAddingUser(true);
        try {
            const res = await fetch("/api/settings/access", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newUserEmail }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || t("common.error"));
            }
            setNewUserEmail("");
            mutateAccess();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsAddingUser(false);
        }
    };

    const handleRemoveUser = async (id: string) => {
        if (!confirm(t("settings.confirmDelete"))) return;
        try {
            const res = await fetch(`/api/settings/access?id=${id}`, {
                method: "DELETE"
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Misslyckades att ta bort användare");
            }
            mutateAccess();
        } catch (err: any) {
            alert(err.message || t("common.error"));
        }
    };

    return (
        <div className="relative min-h-screen bg-slate-950 text-white font-sans selection:bg-amber-500/30">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[-5%] top-[-10%] h-80 w-80 rounded-full bg-amber-400/10 blur-3xl opacity-40" />
                <div className="absolute right-[-10%] top-20 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl opacity-30" />
            </div>

            <main className="relative z-10 mx-auto max-w-5xl px-6 py-12">
                <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <Link
                            href="/"
                            className="mb-4 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                            </svg>
                            {t("dashboard.title")}
                        </Link>
                        <h1 className="text-3xl font-bold tracking-tight text-white">{t("settings.general")}</h1>
                    </div>
                </header>

                {/* Tabs */}
                <div className="mb-8 flex space-x-1 rounded-xl bg-white/5 p-1 overflow-x-auto">
                    {(["general", "servers", "libraries", "users", "access"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white/60 ring-offset-2 ring-offset-slate-950 focus:outline-none focus:ring-2 ${activeTab === tab
                                ? "bg-white text-slate-950 shadow"
                                : "text-white/60 hover:bg-white/[0.12] hover:text-white"
                                }`}
                        >
                            {t(`settings.${tab}`)}
                        </button>
                    ))}
                </div>

                <div className="mt-2">
                    {activeTab === "general" && (
                        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-white">{t("settings.general")}</h2>
                            </div>

                            <div className="mb-8">
                                <label className="mb-1 block text-sm font-medium text-white/70">
                                    {t("settings.language")}
                                </label>
                                <p className="mb-3 text-xs text-white/40">
                                    {t("settings.languageDesc")}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setLanguage("sv")}
                                        className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${language === "sv"
                                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                                            : "border-white/10 bg-black/20 text-white/70 hover:bg-white/10"
                                            }`}
                                    >
                                        Svenska
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLanguage("en")}
                                        className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${language === "en"
                                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                                            : "border-white/10 bg-black/20 text-white/70 hover:bg-white/10"
                                            }`}
                                    >
                                        English
                                    </button>
                                </div>
                            </div>

                            <form
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    const appName = formData.get("appName");

                                    try {
                                        await fetch("/api/settings", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ key: "APP_NAME", value: appName }),
                                        });
                                        await mutateSettings();
                                        alert(t("settings.saveSuccess"));
                                        window.location.reload();
                                    } catch (err) {
                                        alert(t("settings.saveError"));
                                    }
                                }}
                                className="max-w-md space-y-4"
                            >
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-white/70">
                                        {t("settings.applicationName")}
                                    </label>
                                    <input
                                        name="appName"
                                        type="text"
                                        value={formAppName}
                                        onChange={(e) => setFormAppName(e.target.value)}
                                        placeholder={t("settings.appNamePlaceholder")}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/20 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                    <p className="mt-1 text-xs text-white/40">{t("settings.applicationNameDesc")}</p>
                                </div>

                                <button
                                    type="submit"
                                    className="rounded-xl bg-amber-500 px-6 py-2 font-bold text-slate-900 transition hover:bg-amber-400"
                                >
                                    {t("common.save")}
                                </button>
                            </form>
                        </section>
                    )}

                    {activeTab === "servers" && (
                        <section>
                            {serversLoading ? (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/5" />
                                    ))}
                                </div>
                            ) : (serversData?.servers?.length ?? 0) > 0 ? (
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                    {serversData?.servers.map((server) => (
                                        <ServerCard
                                            key={server.id}
                                            server={server}
                                            onEdit={handleOpenEdit}
                                            onDelete={handleDeleteServer}
                                        />
                                    ))}
                                    <AddServerCard onClick={handleOpenAdd} />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 px-6 py-24 text-center">
                                    <div className="mb-6 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 p-6">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-12 w-12 text-amber-500">
                                            <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
                                            <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
                                        </svg>
                                    </div>
                                    <h2 className="mb-2 text-2xl font-bold text-white">{t("settings.welcome")}</h2>
                                    <p className="mb-8 max-w-md text-white/50">
                                        {t("settings.noServers")}
                                    </p>

                                    {serversError && (
                                        <div className="mb-8 flex max-w-md items-center gap-3 rounded-xl border border-rose-500/10 bg-rose-500/5 p-4 text-left text-sm text-rose-200/80">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 opacity-70">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                            </svg>
                                            <div className="flex-1">
                                                <p className="font-medium">{t("settings.dbError")}</p>
                                                <p className="opacity-70 text-xs mt-0.5">{t("settings.dbErrorDesc")}</p>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleOpenAdd}
                                        className="group relative flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 px-8 py-4 font-bold text-white shadow-xl shadow-orange-500/20 transition hover:scale-105 hover:shadow-orange-500/40"
                                    >
                                        <div className="absolute inset-0 bg-white/20 opacity-0 transition group-hover:opacity-100" />
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                        </svg>
                                        {t("settings.addServer")}
                                    </button>
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === "libraries" && (
                        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-white">{t("settings.libraries")}</h2>
                                <p className="text-sm text-white/50">{t("settings.librariesDesc")}</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {dashboardLoading ? (
                                    <div className="col-span-full h-20 animate-pulse rounded-xl bg-white/5" />
                                ) : libraries.length ? (
                                    libraries.map((lib, idx) => (
                                        <div
                                            key={`${lib.key}-${idx}`}
                                            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4"
                                        >
                                            <div>
                                                <p className="font-medium text-white truncate max-w-[150px]" title={lib.title}>{lib.title}</p>
                                                <p className="text-xs text-white/40 capitalize">{lib.type}</p>
                                            </div>
                                            <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-white">
                                                {lib.count}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full text-center text-white/50 py-8">Inga bibliotek hittades</div>
                                )}
                            </div>
                        </section>
                    )}

                    {activeTab === "users" && (
                        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
                            <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-white">{t("settings.users")}</h2>
                                    <p className="text-sm text-white/50">{t("settings.usersDesc")}</p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Server Filter */}
                                    <div className="flex items-center rounded-xl bg-black/20 p-1">
                                        <select
                                            value={filterServerId}
                                            onChange={(e) => setFilterServerId(e.target.value)}
                                            className="rounded-lg bg-transparent py-1.5 pl-3 pr-8 text-sm font-medium text-white focus:outline-none focus:ring-0 [&>option]:bg-slate-900"
                                        >
                                            <option value="">{t("settings.allServers")}</option>
                                            {serversData?.servers?.map((server) => (
                                                <option key={server.id} value={server.id}>
                                                    {server.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Sort Controls */}
                                    <div className="flex items-center rounded-xl bg-black/20 p-1">
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as "name" | "status")}
                                            className="rounded-lg bg-transparent py-1.5 pl-3 pr-8 text-sm font-medium text-white focus:outline-none focus:ring-0 [&>option]:bg-slate-900"
                                        >
                                            <option value="name">{t("settings.name")}</option>
                                            <option value="status">{t("settings.status")}</option>
                                        </select>
                                        <button
                                            onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                                            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                                            title={sortOrder === "asc" ? t("settings.ascending") : t("settings.descending")}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`}>
                                                <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>

                                    <button
                                        onClick={handleImportUsers}
                                        disabled={users.length === 0 || isImporting}
                                        className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
                                    >
                                        {isImporting ? (
                                            t("settings.importing")
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
                                                </svg>
                                                {t("settings.importAll")}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {usersLoading ? (
                                    <div className="col-span-full h-20 animate-pulse rounded-xl bg-white/5" />
                                ) : sortedUsers.length ? (
                                    sortedUsers.map((user, idx) => (
                                        <div
                                            key={`${user.id}-${idx}`}
                                            className={`flex items-center gap-4 rounded-xl border p-4 transition ${user.isImported
                                                ? "border-green-500/30 bg-green-500/10"
                                                : "border-white/5 bg-white/5 hover:bg-white/10"
                                                }`}
                                        >
                                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-800">
                                                {user.thumb ? (
                                                    <img src={user.thumb} alt={user.title} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/30">
                                                        {user.title.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="overflow-hidden flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate font-medium text-white" title={user.title}>{user.title}</p>
                                                    {user.isImported && (
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                        </svg>
                                                    )}
                                                </div>
                                                {/* Added Server Name Display */}
                                                <p className="truncate text-xs text-white/40">{user.serverName}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full text-center text-white/50 py-8">Inga användare hittades</div>
                                )}
                            </div>
                        </section>
                    )}

                    {activeTab === "access" && (
                        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-white">{t("settings.access")}</h2>
                                <p className="text-sm text-white/50">{t("settings.accessDesc")}</p>
                            </div>

                            <form onSubmit={handleAddUser} className="mb-8 flex gap-2">
                                <input
                                    type="email"
                                    required
                                    placeholder={t("settings.emailPlaceholder")}
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/20 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                                <button
                                    type="submit"
                                    disabled={isAddingUser}
                                    className="rounded-xl bg-amber-500 px-6 py-2 font-bold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                                >
                                    {isAddingUser ? t("common.loading") : t("settings.addUser")}
                                </button>
                            </form>

                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-white">{t("settings.allowedUsers")}</h3>
                                {isAccessLoading ? (
                                    <div className="h-10 animate-pulse rounded-xl bg-white/5" />
                                ) : (accessData?.users?.length ?? 0) === 0 ? (
                                    <p className="text-sm text-white/50">{t("settings.noAllowedUsers")}</p>
                                ) : (
                                    accessData?.users.map((user) => (
                                        <div
                                            key={user.id}
                                            className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4 transition hover:bg-white/10"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 font-bold">
                                                    {user.email.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{user.email}</p>
                                                    <p className="text-xs text-white/40">
                                                        {new Date(user.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveUser(user.id)}
                                                className="rounded-lg bg-rose-500/10 p-2 text-rose-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/20"
                                                title={t("common.delete")}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 001.5.06l.3-7.5z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </main>

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <h2 className="mb-6 text-2xl font-bold text-white">
                            {editingServer ? t("common.edit") + " " + t("session.server") : t("settings.addServer")}
                        </h2>

                        {/* Discovery Toggle (Only for New Server) */}
                        {!editingServer && (
                            <div className="mb-6 flex rounded-lg bg-black/20 p-1">
                                <button
                                    type="button"
                                    onClick={() => setDiscoveryMode("auto")}
                                    className={`flex-1 rounded-md py-2 text-sm font-medium transition ${discoveryMode === "auto" ? "bg-amber-500 text-slate-900" : "text-white/50 hover:text-white"}`}
                                >
                                    {t("onboarding.plexAccount")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDiscoveryMode("manual")}
                                    className={`flex-1 rounded-md py-2 text-sm font-medium transition ${discoveryMode === "manual" ? "bg-amber-500 text-slate-900" : "text-white/50 hover:text-white"}`}
                                >
                                    {t("onboarding.manual")}
                                </button>
                            </div>
                        )}

                        {submitError && (
                            <div className="mb-4 rounded-xl bg-rose-500/20 p-3 text-sm text-rose-200 border border-rose-500/30">
                                {submitError}
                            </div>
                        )}


                        <form onSubmit={handleSubmit} className="space-y-4">

                            {/* Auto Discovery UI */}
                            {!editingServer && discoveryMode === "auto" && (
                                <div className="space-y-4 mb-4 border-b border-white/10 pb-4">
                                    {!discoveryToken ? (
                                        // Unauthenticated State (for Discovery)
                                        <div className="text-center">
                                            <p className="mb-4 text-sm text-white/60">
                                                {t("onboarding.loginDesc")}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handlePlexSignIn}
                                                disabled={isAuthenticating}
                                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e5a00d] px-4 py-3 font-bold text-white transition hover:bg-[#d4940c] disabled:opacity-50"
                                            >
                                                {isAuthenticating ? (
                                                    t("login.authenticating")
                                                ) : (
                                                    <>
                                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
                                                        </svg>
                                                        {t("login.signInWithPlex")}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        // Authenticated State (Discovery Token Present)
                                        <div>
                                            <div className="flex gap-2 mb-2">
                                                <div className="relative flex-1">
                                                    <select
                                                        onChange={(e) => handleSelectConnection(e.target.value)}
                                                        className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white focus:border-amber-500 focus:outline-none"
                                                    >
                                                        <option value="">{t("onboarding.form.selectServer")}</option>
                                                        {flatConnections.map((conn) => (
                                                            <option key={conn.id} value={conn.id}>
                                                                {conn.name} ({conn.uri}) - {conn.isLocal ? "Local" : "Remote"}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/50">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                                        </svg>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => fetchPlexResources()}
                                                    disabled={isLoadingResources}
                                                    className="flex items-center justify-center rounded-xl bg-indigo-600 px-4 text-white hover:bg-indigo-500 disabled:opacity-50"
                                                    title={t("settings.refreshList")}
                                                >
                                                    {isLoadingResources ? (
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
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDiscoveryToken("");
                                                    setFetchedServers([]);
                                                }}
                                                className="text-xs text-rose-400 hover:text-rose-300 underline"
                                            >
                                                {t("common.logout")}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {(discoveryMode === "manual" || editingServer || (discoveryMode === "auto" && formUrl)) && (
                                <>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-white/70">{t("settings.serverName")} ({t("common.optional") || "Optional"})</label>
                                        <input
                                            data-testid="input-name"
                                            type="text"
                                            value={formName}
                                            onChange={(e) => setFormName(e.target.value)}
                                            placeholder="Hemma Server"
                                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/20 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-white/70">{t("settings.serverUrl")}</label>
                                        <input
                                            data-testid="input-url"
                                            type="text"
                                            required
                                            value={formUrl}
                                            onChange={(e) => setFormUrl(e.target.value)}
                                            placeholder="http://192.168.1.10:32400"
                                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/20 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-white/70">
                                            {t("settings.plexToken")} {editingServer ? `(${t("settings.leaveEmptyToKeep")})` : ""}
                                        </label>
                                        <input
                                            data-testid="input-token"
                                            type="text"
                                            required={!editingServer}
                                            value={formToken}
                                            onChange={(e) => setFormToken(e.target.value)}
                                            placeholder="X-Plex-Token"
                                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/20 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        />
                                    </div>

                                    {/* Test Connection Button Block matching Setup Page */}
                                    <div className="flex flex-col gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={handleTestConnection}
                                            disabled={isTesting || !formUrl || !formToken}
                                            className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50 transition-colors"
                                        >
                                            {isTesting ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span>Testing...</span>
                                                </div>
                                            ) : (
                                                t("onboarding.form.verify") || "Test"
                                            )}
                                        </button>

                                        {/* Result Message (Replacing the global one at top for better context placement) */}
                                        {testResult && (
                                            <div className={`rounded-xl p-3 text-sm border ${testResult.success ? "bg-green-500/20 text-green-200 border-green-500/30" : "bg-rose-500/20 text-rose-200 border-rose-500/30"}`}>
                                                {testResult.message}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-white/70">{t("settings.colorCoding")}</label>
                                        <div className="flex flex-wrap gap-3">
                                            {[
                                                "#F87171", "#34D399", "#60A5FA", "#A78BFA", "#FBBF24",
                                                "#FB7185", "#2DD4BF", "#C084FC", "#818CF8", "#F472B6"
                                            ].map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    onClick={() => setFormColor(color)}
                                                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${formColor === color ? "border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "border-transparent opacity-70 hover:opacity-100"
                                                        }`}
                                                    style={{ backgroundColor: color }}
                                                    title={color}
                                                />
                                            ))}

                                            {/* Custom Gradient Picker */}
                                            <label
                                                className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500 transition-transform hover:scale-110 ${formColor && !["#F87171", "#34D399", "#60A5FA", "#A78BFA", "#FBBF24", "#FB7185", "#2DD4BF", "#C084FC", "#818CF8", "#F472B6"].includes(formColor)
                                                    ? "border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                                    : "border-transparent opacity-70 hover:opacity-100"
                                                    }`}
                                                title={t("settings.customColor")}
                                                style={formColor && !["#F87171", "#34D399", "#60A5FA", "#A78BFA", "#FBBF24", "#FB7185", "#2DD4BF", "#C084FC", "#818CF8", "#F472B6"].includes(formColor) ? { background: formColor } : undefined}
                                            >
                                                <input
                                                    type="color"
                                                    value={formColor || "#ffffff"}
                                                    onChange={(e) => setFormColor(e.target.value)}
                                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                />
                                                {!formColor || ["#F87171", "#34D399", "#60A5FA", "#A78BFA", "#FBBF24", "#FB7185", "#2DD4BF", "#C084FC", "#818CF8", "#F472B6"].includes(formColor) ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-white drop-shadow-md">
                                                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                                    </svg>
                                                ) : null}
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => setFormColor("")}
                                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 text-white/50 transition-transform hover:scale-110 hover:text-white ${formColor === "" ? "border-white text-white scale-110" : ""
                                                    }`}
                                                title={t("settings.noColor")}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 8.75V5a.75.75 0 00-1.5 0v5.75H3.5a.75.75 0 000 1.5h5.75v5.75a.75.75 0 001.5 0v-5.75h5.75a.75.75 0 000-1.5H10.75z" clipRule="evenodd" transform="rotate(45 10 10)" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {(discoveryMode === "manual" || editingServer) && (
                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={handleTestConnection}
                                        disabled={isTesting || !formUrl || !formToken}
                                        className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 py-3 font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                                    >
                                        {isTesting ? t("common.loading") : t("settings.testConnection")}
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 font-semibold text-white hover:bg-white/10"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    data-testid="btn-save"
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                >
                                    {isSubmitting ? t("common.loading") : editingServer ? t("common.save") : t("common.add")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

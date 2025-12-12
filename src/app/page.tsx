"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { LibrarySection, PlexSession, SessionSummary } from "@/lib/plex";
import { SessionCard } from "@/components/SessionCard";
import { SummaryCard } from "@/components/SummaryCard";
import Link from "next/link";

type DashboardResponse = {
  sessions: PlexSession[];
  summary: SessionSummary;
  libraries: LibrarySection[];
  updatedAt: string;
  appName?: string;
};

import type { PublicServer } from "@/lib/servers";
import { getServerColor } from "@/lib/serverColors";
import { useLanguage } from "@/components/LanguageContext";
import { UserMenu } from "@/components/UserMenu";

type ServersResponse = {
  servers: PublicServer[];
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
    const message = detail || "Misslyckades att hämta data";
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

const formatBandwidth = (value: number) => {
  if (!value) return "0 Mbps";
  const mbps = value / 1000;
  return `${mbps.toFixed(mbps >= 10 ? 0 : 1)} Mbps`;
};

export default function Home() {
  const { t } = useLanguage();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  // Poll for history sync every 30 seconds
  useSWR("/api/cron", fetchJson, { refreshInterval: 30000, refreshWhenHidden: true });

  const {
    data: serversData,
    error: serversError,
    isLoading: serversLoading,
    mutate: mutateServers,
  } = useSWR<ServersResponse>("/api/servers", fetchJson);

  useEffect(() => {
    // Redirect to setup if we have loaded servers but found none
    if (!serversLoading && serversData && serversData.servers.length === 0) {
      window.location.href = "/setup";
    }
  }, [serversLoading, serversData]);

  const dashboardKey = "/api/dashboard";

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<DashboardResponse>(dashboardKey, fetchJson, {
    refreshInterval: 5000, // Faster updates for live feeling
    revalidateOnFocus: false,
  });

  const allSessions = data?.sessions ?? [];
  const appName = data?.appName;
  const libraries = data?.libraries ?? [];

  // Filter sessions based on selection
  const filteredSessions = useMemo(() => {
    if (!selectedServerId) return allSessions;
    return allSessions.filter(s => s.serverId === selectedServerId);
  }, [allSessions, selectedServerId]);

  // Recalculate summary based on filtered sessions
  const summary = useMemo(() => {
    if (!data) return {
      active: 0,
      directPlay: 0,
      transcoding: 0,
      paused: 0,
      bandwidth: 0,
    };

    // If no filter, use server provided summary
    if (!selectedServerId) return data.summary;

    // Recalculate for filtered view
    return filteredSessions.reduce((acc, session) => {
      acc.active++;
      acc.bandwidth += session.bandwidth || 0;

      const isTranscode = session.decision?.toLowerCase() === "transcode";
      const isPaused = session.state?.toLowerCase() === "paused";

      if (isPaused) acc.paused++;
      else if (isTranscode) acc.transcoding++;
      else acc.directPlay++;

      return acc;
    }, {
      active: 0,
      directPlay: 0,
      transcoding: 0,
      paused: 0,
      bandwidth: 0,
      serverName: serversData?.servers.find(s => s.id === selectedServerId)?.name
    } as SessionSummary);
  }, [data, filteredSessions, selectedServerId, serversData]);

  const activeServerName =
    selectedServerId
      ? serversData?.servers.find((server) => server.id === selectedServerId)?.name ?? t("common.unknown") + " " + t("session.server")
      : t("dashboard.all") + " " + t("settings.servers").toLowerCase();

  const handleSelectServer = (id: string | null) => {
    setSelectedServerId(id);
  };


  const selectedServer = useMemo(
    () => serversData?.servers.find((server) => server.id === selectedServerId),
    [serversData?.servers, selectedServerId],
  );

  // Helper to render interactive tags
  const renderInteractiveTags = (
    data: Record<string, { name: string; count: number; label?: string }>,
    metricType: "count" | "bandwidth"
  ) => (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {Object.entries(data).map(([id, { name, count, label }]) => {
        const serverObj = serversData?.servers.find((s) => s.id === id);
        const color = getServerColor(id, serverObj?.color);
        const isSelected = selectedServerId === id;

        return (
          <button
            key={id}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectServer(id === "unknown" ? null : id === selectedServerId ? null : id);
            }}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${isSelected
              ? "text-white ring-2 ring-white/20 shadow-md transform scale-105"
              : "text-white/70 hover:text-white hover:scale-105 opacity-60 hover:opacity-100" // Modified to show others but dimmed
              }`}
            style={{
              backgroundColor: isSelected ? color : `${color}20`,
              boxShadow: isSelected ? `0 0 15px ${color}60` : "none",
              border: `1px solid ${isSelected ? color : `${color}40`}`
            }}
          >
            <span>{name}:</span>
            <span className="text-white">
              {label || count}
            </span>
          </button>
        );
      })}
    </div>
  );

  // Stats need to be calculated from ALL sessions to keep tags visible
  const statsSource = allSessions;

  // 1. Streams per Server
  const streamsPerServer = statsSource.reduce((acc, session) => {
    const id = session.serverId || "unknown";
    const name = session.serverName || "Unknown";
    if (!acc[id]) acc[id] = { name, count: 0 };
    acc[id].count += 1;
    return acc;
  }, {} as Record<string, { name: string; count: number }>);

  // 2. Direct Play per Server
  const directPlayPerServer = statsSource.reduce((acc, session) => {
    // If it's not explicitly transcoding, treat as direct play for this breakdown
    const isTranscode = session.decision?.toLowerCase() === "transcode";
    if (!isTranscode) {
      const id = session.serverId || "unknown";
      const name = session.serverName || "Unknown";
      if (!acc[id]) acc[id] = { name, count: 0 };
      acc[id].count += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; count: number }>);

  // 3. Transcode per Server
  const transcodePerServer = statsSource.reduce((acc, session) => {
    const isTranscode = session.decision?.toLowerCase() === "transcode";
    if (isTranscode) {
      const id = session.serverId || "unknown";
      const name = session.serverName || "Unknown";
      if (!acc[id]) acc[id] = { name, count: 0 };
      acc[id].count += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; count: number }>);

  // 4. Bandwidth per Server
  const bandwidthPerServer = statsSource.reduce((acc, session) => {
    const id = session.serverId || "unknown";
    const name = session.serverName || "Unknown";
    const bandwidth = session.bandwidth || 0;

    if (!acc[id]) acc[id] = { name, count: 0 };
    acc[id].count += bandwidth;
    return acc;
  }, {} as Record<string, { name: string; count: number; label?: string }>);

  // Format bandwidth labels
  Object.keys(bandwidthPerServer).forEach(id => {
    bandwidthPerServer[id].label = formatBandwidth(bandwidthPerServer[id].count);
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white font-sans selection:bg-amber-500/30">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-5%] top-[-10%] h-80 w-80 rounded-full bg-amber-400/20 blur-3xl opacity-60" />
        <div className="absolute right-[-10%] top-10 h-96 w-96 rounded-full bg-orange-500/15 blur-3xl opacity-50" />
        <div className="absolute left-[20%] top-[40%] h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl opacity-40" />
      </div>

      <main className="relative z-10 mx-auto max-w-[95%] px-6 py-12">
        <header className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              {appName ? (
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white animate-in fade-in duration-500">
                  {appName}
                </h1>
              ) : (
                <div className="h-8 w-32 sm:h-9 sm:w-48 animate-pulse rounded-lg bg-white/10" />
              )}
            </div>
          </div>

          <div className="flex items-center">
            <UserMenu />
          </div>
        </header>

        <section className="mt-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label={t("dashboard.streams")}
            value={summary.active.toString()}
            detail={Object.keys(streamsPerServer).length > 0 ? renderInteractiveTags(streamsPerServer, "count") : t("dashboard.noActiveSessions")}
            accent="border-amber-500/20 bg-amber-500/10 text-amber-500"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
              </svg>
            }
          />
          <SummaryCard
            label={t("dashboard.directPlay")}
            value={summary.directPlay.toString()}
            detail={Object.keys(directPlayPerServer).length > 0 ? renderInteractiveTags(directPlayPerServer, "count") : t("dashboard.noTranscoding")}
            accent="border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
              </svg>
            }
          />
          <SummaryCard
            label={t("dashboard.transcode")}
            value={summary.transcoding.toString()}
            detail={Object.keys(transcodePerServer).length > 0 ? renderInteractiveTags(transcodePerServer, "count") : t("dashboard.cpuChugging")}
            accent="border-rose-500/20 bg-rose-500/10 text-rose-500"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.035-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.035.84-1.875 1.875-1.875h.75c1.035 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
              </svg>
            }
          />
          <SummaryCard
            label={t("dashboard.bandwidth")}
            value={formatBandwidth(summary.bandwidth)}
            detail={Object.keys(bandwidthPerServer).length > 0 ? renderInteractiveTags(bandwidthPerServer, "bandwidth") : t("dashboard.networkLoad")}
            accent="border-cyan-500/20 bg-cyan-500/10 text-cyan-500"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
              </svg>
            }
          />
        </section>

        <div className="mt-10 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-xl font-bold text-white">{t("dashboard.activeSessions")}</h2>

              {/* Server Filters */}
              {serversData?.servers && serversData.servers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleSelectServer(null)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all shadow-lg ${selectedServerId === null
                      ? "bg-white text-black border-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wide">{t("dashboard.all")}</span>
                  </button>

                  {serversData.servers.map((server) => {
                    const color = getServerColor(server.id, server.color);
                    const isActive = selectedServerId === server.id;
                    return (
                      <button
                        key={server.id}
                        onClick={() => handleSelectServer(isActive ? null : server.id)}
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all ${isActive
                          ? "text-white scale-105 ring-1 ring-white/20"
                          : "text-white/70 hover:text-white hover:scale-105"
                          }`}
                        style={{
                          backgroundColor: isActive ? color : `${color}20`,
                          borderColor: isActive ? color : `${color}40`,
                          boxShadow: isActive ? `0 0 15px ${color}60` : "none"
                        }}
                      >
                        <span className="text-xs font-bold uppercase tracking-wide drop-shadow-md">
                          {server.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <p className="text-xs font-medium text-white/50">{t("dashboard.live")}</p>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {error ? (
              <div className="col-span-full rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                {t("common.error")}: {error.message}
              </div>
            ) : null}

            {isLoading ? (
              <div className="col-span-full grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-44 w-full animate-pulse rounded-lg bg-white/5"
                  />
                ))}
              </div>
            ) : null}

            {!isLoading && filteredSessions.length === 0 && !error ? (
              <div className="col-span-full flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
                <div className="rounded-full bg-white/5 p-6 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-white/40">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </div>
                <p className="text-xl font-medium text-white/70">{t("dashboard.quiet")}</p>
                <p className="text-sm text-white/40 max-w-sm mt-2">{t("dashboard.quietDesc").replace("{server}", activeServerName)}</p>
              </div>
            ) : null}

            {/* Render actual sessions or debug layout */}
            {filteredSessions.map((session) => {
              const serverObj = serversData?.servers.find(s => s.id === session.serverId);
              const color = getServerColor(session.serverId, serverObj?.color);
              return <SessionCard key={session.id} session={session} serverColor={color} />;
            })}
          </div>
        </div>
      </main >
    </div >
  );
}


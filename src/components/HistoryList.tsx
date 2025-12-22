"use client";

import { HistoryEntry } from "@/lib/history";
import { PlexSession } from "@/lib/plex";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import { useRouter } from "next/navigation";
import { getPlayerIcon, getSplitDisplayTitle, useLivePause } from "./HistoryHelpers";
import { HistoryModal } from "./HistoryModal";
import clsx from "clsx";
import { Trash2, AlertCircle } from "lucide-react";

export function HistoryList({
    history,
    timeZone,
    isEditing,
    onToggleEdit
}: {
    history: HistoryEntry[];
    timeZone: string;
    isEditing: boolean;
    onToggleEdit: (editing: boolean) => void;
}) {
    const { t, language } = useLanguage();
    const router = useRouter();
    const locale = language === 'sv' ? 'sv-SE' : 'en-US';

    const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    if (!history) return <div className="p-12 text-center text-white/50 animate-pulse">Loading history...</div>;
    if (history.length === 0) return (
        <div className="flex flex-col items-center justify-center p-20 text-center rounded-3xl border border-dashed border-white/10 bg-white/5">
            <div className="p-4 rounded-full bg-white/5 mb-4">
                <AlertCircle className="w-8 h-8 text-white/30" />
            </div>
            <h3 className="text-xl font-bold text-white">{t("dashboard.quiet")}</h3>
            <p className="text-white/50 mt-2">No playback history found matching your criteria.</p>
        </div>
    );

    const groupedHistory = history.reduce((groups, entry) => {
        const dateKey = new Date(entry.startTime).toLocaleDateString(locale, { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(entry);
        return groups;
    }, {} as Record<string, HistoryEntry[]>);

    const sortedKeys = Object.keys(groupedHistory).sort((a, b) => {
        // We need a stable date sort. The key format above is readable but hard to sort.
        // Let's rely on the first item's startTime in the group for sorting.
        const timeA = groupedHistory[a][0]?.startTime || 0;
        const timeB = groupedHistory[b][0]?.startTime || 0;
        return timeB - timeA;
    });

    const toggleSelection = (id: string, e?: React.SyntheticEvent) => {
        e?.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const toggleGroupSelection = (entries: HistoryEntry[]) => {
        const ids = entries.map(e => e.id);
        const allSelected = ids.every(id => selectedIds.has(id));
        const newSelected = new Set(selectedIds);
        if (allSelected) ids.forEach(id => newSelected.delete(id));
        else ids.forEach(id => newSelected.add(id));
        setSelectedIds(newSelected);
    }

    const deleteSelected = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) return;
        setIsDeleting(true);
        try {
            await fetch("/api/history", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            });
            setSelectedIds(new Set());
            onToggleEdit(false);
            router.refresh();
            window.location.reload();
        } catch (error) {
            alert("Failed to delete items");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <div className="space-y-12 pb-24">
                {sortedKeys.map((date) => (
                    <div key={date} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {/* ... header ... */}
                        <div className="flex items-center gap-4 mb-6">
                            {isEditing && (
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                                    checked={groupedHistory[date].every(e => selectedIds.has(e.id))}
                                    onChange={() => toggleGroupSelection(groupedHistory[date])}
                                />
                            )}
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-white/60 whitespace-nowrap">
                                {date}
                            </h3>
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        </div>

                        {/* Mobile Grid/List View */}
                        <div className="md:hidden grid gap-3 sm:grid-cols-2">
                            {groupedHistory[date].map((entry) => (
                                <MobileHistoryCard
                                    key={entry.id}
                                    entry={entry}
                                    timeZone={timeZone}
                                    locale={locale}
                                    isEditing={isEditing}
                                    isSelected={selectedIds.has(entry.id)}
                                    onToggle={(e: React.SyntheticEvent) => toggleSelection(entry.id, e)}
                                    onSelect={() => !isEditing && setSelectedEntry(entry)}
                                />
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-hidden rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm">
                            <table className="w-full text-left text-sm text-white/80">
                                {/* ... thead ... */}
                                <thead className="bg-white/5 text-xs font-bold uppercase tracking-wider text-white/50">
                                    <tr>
                                        {isEditing && <th className="w-12 px-6 py-4"></th>}
                                        <th className="px-6 py-4">{t("session.stream")}</th>
                                        <th className="px-6 py-4">{t("session.server")}</th>
                                        <th className="px-6 py-4">User</th>
                                        <th className="px-6 py-4">{t("common.start")}</th>
                                        <th className="px-6 py-4">{t("common.end")}</th>
                                        <th className="px-6 py-4">Duration</th>
                                        <th className="px-6 py-4 text-right">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {groupedHistory[date].map((entry) => (
                                        <HistoryRow
                                            key={entry.id}
                                            entry={entry}
                                            timeZone={timeZone}
                                            locale={locale}
                                            isEditing={isEditing}
                                            isSelected={selectedIds.has(entry.id)}
                                            onToggle={(e: React.SyntheticEvent) => toggleSelection(entry.id, e)}
                                            onSelect={() => !isEditing && setSelectedEntry(entry)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            {/* ... rest of component ... */}


            {/* Selection/Deletion Bar */}
            <div className={clsx(
                "fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 transform",
                isEditing && selectedIds.size > 0 ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
            )}>
                <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 rounded-2xl px-8 py-4 flex items-center gap-8 min-w-[320px]">
                    <span className="text-white font-bold">{selectedIds.size} selected</span>
                    <div className="h-6 w-px bg-white/10"></div>
                    <button
                        onClick={deleteSelected}
                        disabled={isDeleting}
                        className="flex items-center gap-2 text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider text-xs disabled:opacity-50 transition-colors ml-auto"
                    >
                        <Trash2 className={clsx("w-4 h-4", isDeleting && "animate-bounce")} />
                        {isDeleting ? "Deleting..." : "Delete Selection"}
                    </button>
                </div>
            </div>

            {selectedEntry && (
                <HistoryModal
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                />
            )}
        </>
    );
}


interface HistoryItemProps {
    entry: HistoryEntry;
    timeZone: string;
    locale: string;
    isEditing: boolean;
    isSelected: boolean;
    onToggle: (e: React.SyntheticEvent) => void;
    onSelect: () => void;
}

function MobileHistoryCard({ entry, timeZone, locale, isEditing, isSelected, onToggle, onSelect }: HistoryItemProps) {
    const details = entry.meta_json ? (JSON.parse(entry.meta_json) as PlexSession) : null;
    const { mainTitle, subTitle, isTV } = getSplitDisplayTitle(entry, details, locale);
    const pausedCounter = useLivePause(entry);
    const isActive = !entry.stopTime;

    let progress = 0;
    if (details?.duration) {
        let rawProgress = 0;
        if (isActive && details) {
            const elapsed = (Date.now() - entry.startTime) / 1000 - pausedCounter;
            rawProgress = Math.round((elapsed / (details.duration / 1000)) * 100);
        } else {
            const viewedDuration = (entry.stopTime - entry.startTime) - (entry.pausedCounter * 1000);
            rawProgress = Math.round((viewedDuration / details.duration) * 100);
        }
        progress = Math.min(100, Math.max(0, rawProgress));
    }

    const relativeTime = (() => {
        const now = new Date();
        const start = new Date(entry.startTime);
        const diffMs = now.getTime() - start.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHrs < 24) {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            return diffHrs === 0 ? `${diffMins}m ago` : `${diffHrs}h ago`;
        }
        return start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    })();

    return (
        <div
            onClick={isEditing ? onToggle : onSelect}
            className={clsx(
                "relative flex items-center gap-4 p-4 rounded-3xl border transition-all cursor-pointer overflow-hidden",
                isSelected
                    ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                    : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
            )}
        >
            {isEditing && (
                <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={onToggle}
                        className="w-5 h-5 rounded-full border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                    />
                </div>
            )}

            <div className="relative shrink-0 w-16 h-24 rounded-xl overflow-hidden bg-black/40 shadow-lg ring-1 ring-white/10">
                {details?.thumb ? (
                    <img src={`/api/image?path=${encodeURIComponent(details.thumb)}&serverId=${details.serverId || ""}`} className="w-full h-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                        <img src={isTV ? "/images/libraries/show.svg" : "/images/libraries/movie.svg"} className="w-8 h-8 opacity-20" />
                    </div>
                )}
                {/* Progress Bar Overlay */}
                <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                    <div className={clsx("h-full", progress >= 90 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${progress}%` }} />
                </div>
            </div>

            <div className="flex-1 min-w-0 py-1">
                <h4 className="text-sm font-bold text-white truncate">{mainTitle}</h4>
                <div className="flex items-center gap-1.5 mb-3">
                    <img
                        src={isTV ? "/images/libraries/show.svg" : "/images/libraries/movie.svg"}
                        alt={isTV ? "Series" : "Movie"}
                        className="w-3 h-3 opacity-50 shrink-0"
                    />
                    <p className="text-xs text-white/50 truncate flex-1" title={subTitle}>{subTitle || '\u00A0'}</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/5">
                        <div className="h-4 w-4 rounded-full overflow-hidden bg-white/10">
                            {details?.userThumb ? <img src={details.userThumb} className="w-full h-full object-cover" /> : <div className="text-[8px] flex items-center justify-center font-bold h-full">{entry.user.slice(0, 1)}</div>}
                        </div>
                        <span className="text-[10px] font-bold text-white/70 max-w-[60px] truncate">{entry.user}</span>
                    </div>
                    {isActive ? (
                        <span className="text-[10px] font-bold text-emerald-400 animate-pulse uppercase tracking-wider">Playing</span>
                    ) : (
                        <span className="text-[10px] font-medium text-white/30">{relativeTime}</span>
                    )}
                </div>
            </div>
        </div>
    )
}

function HistoryRow({ entry, timeZone, locale, isEditing, isSelected, onToggle, onSelect }: HistoryItemProps) {
    const details = entry.meta_json ? (JSON.parse(entry.meta_json) as PlexSession) : null;
    const isTranscode = details?.decision === "transcode";
    const isActive = !entry.stopTime;
    const { mainTitle, subTitle, isTV } = getSplitDisplayTitle(entry, details, locale);
    const pausedCounter = useLivePause(entry);

    let progress = 0;
    if (details?.duration) {
        let rawProgress = 0;
        if (isActive && details) {
            const elapsed = (Date.now() - entry.startTime) / 1000 - pausedCounter;
            rawProgress = Math.round((elapsed / (details.duration / 1000)) * 100);
        } else {
            const viewedDuration = (entry.stopTime - entry.startTime) - (entry.pausedCounter * 1000);
            rawProgress = Math.round((viewedDuration / details.duration) * 100);
        }
        progress = Math.min(100, Math.max(0, rawProgress));
    }

    const startTimeResult = new Date(entry.startTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone, hour12: false });
    const stopTimeResult = isActive ? <span className="text-emerald-400 font-bold animate-pulse text-[10px] uppercase">Active</span> : new Date(entry.stopTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone, hour12: false });
    const activeMinutes = Math.max(0, Math.round((entry.duration - pausedCounter) / 60));

    return (
        <tr
            onClick={isEditing ? onToggle : onSelect}
            className={clsx(
                "group cursor-pointer transition-colors border-b border-transparent last:border-0",
                isSelected ? "bg-amber-500/10 hover:bg-amber-500/20" : "hover:bg-white/5 active:bg-white/10"
            )}
        >
            {isEditing && (
                <td className="px-6 py-4">
                    <div onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={onToggle}
                            className="w-5 h-5 rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                        />
                    </div>
                </td>
            )}
            <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                    <div className="relative h-10 w-16 shrink-0 rounded-lg overflow-hidden bg-black/40 ring-1 ring-white/10">
                        {details?.thumb ? <img src={`/api/image?path=${encodeURIComponent(details.thumb)}&serverId=${details.serverId || ""}`} className="w-full h-full object-cover" /> : null}
                        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/50">
                            <div className={clsx("h-full", progress >= 90 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-white truncate max-w-[200px]" title={mainTitle}>{mainTitle}</span>
                        {subTitle && (
                            <div className="flex items-center gap-1.5 min-w-0">
                                <img
                                    src={isTV ? "/images/libraries/show.svg" : "/images/libraries/movie.svg"}
                                    alt={isTV ? "Series" : "Movie"}
                                    className="w-3 h-3 opacity-50 shrink-0"
                                />
                                <span className="text-xs text-white/50 truncate max-w-[200px]" title={subTitle}>{subTitle}</span>
                            </div>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-inset ring-white/10">
                    {entry.serverName || "Unknown"}
                </span>
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="h-6 w-6 shrink-0 rounded-full bg-indigo-500/20 ring-1 ring-inset ring-indigo-500/30 overflow-hidden">
                        {details?.userThumb ? <img src={details.userThumb} className="w-full h-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[8px] font-bold text-indigo-300">{entry.user.slice(0, 1)}</div>}
                    </div>
                    <span className="text-xs font-medium text-white/80">{entry.user}</span>
                </div>
            </td>
            <td className="px-6 py-4 text-xs font-mono text-white/60">{startTimeResult}</td>
            <td className="px-6 py-4 text-xs font-mono text-white/60">{stopTimeResult}</td>
            <td className="px-6 py-4 text-xs font-medium text-white/70">
                {activeMinutes} min
            </td>
            <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                    {/* Icons for decision/player */}
                    {isTranscode ? (
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500" title="Transcode">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.433l-.312-.312a7 7 0 00-11.712 3.139.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.312h-2.433a.75.75 0 000 1.5h4.242a.75.75 0 00.53-.219z" clipRule="evenodd" /></svg>
                        </div>
                    ) : (
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500" title="Direct Play">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                        </div>
                    )}
                    {getPlayerIcon(details?.player, details?.platform, "w-7 h-7 p-1.5 rounded-lg bg-white/5 text-white/50")}
                </div>
            </td>
        </tr>
    );
}

function ProgressRing({ progress, size = 28 }: { progress: number; size?: number }) {
    return null; // Deprecated in favor of bar
}

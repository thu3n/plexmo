import { HistoryEntry } from "@/lib/history";

export const HistoryList = ({ history }: { history: HistoryEntry[] }) => {
    if (!history.length) {
        return (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-white/60">
                Ingen historik tillgänglig ännu.
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            {history.map((entry) => (
                <div
                    key={entry.id}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200">
                                {entry.user.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <p className="font-medium text-white">{entry.title}</p>
                                <div className="flex items-center gap-2 text-xs text-white/60">
                                    <span>{entry.user}</span>
                                    <span>•</span>
                                    <span>{new Date(entry.startTime).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>{Math.round(entry.duration / 60)} minuter</span>
                                </div>
                            </div>
                        </div>

                        <div className="hidden flex-col items-end text-xs text-white/50 sm:flex">
                            <span className="font-medium text-white/70">{entry.serverName}</span>
                            <span>{entry.platform}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { HistoryList } from "@/components/HistoryList";
import Link from "next/link";
import { HistoryEntry } from "@/lib/history";
import { Suspense } from "react";

const fetchJson = (url: string) => fetch(url).then((res) => res.json());

function HistoryContent() {
    const searchParams = useSearchParams();
    const serverId = searchParams.get("serverId");

    const { data } = useSWR<{ history: HistoryEntry[] }>(
        `/api/history${serverId ? `?serverId=${serverId}` : ""}`,
        fetchJson
    );

    return (
        <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
            <div className="mx-auto max-w-4xl">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <Link
                            href="/"
                            className="mb-2 inline-block text-sm font-semibold text-amber-200 hover:text-amber-100"
                        >
                            ← Tillbaka till översikt
                        </Link>
                        <h1 className="text-3xl font-bold">Historik</h1>
                        <p className="text-white/60">Senaste aktiviteterna</p>
                    </div>
                </div>

                <HistoryList history={data?.history ?? []} />
            </div>
        </div>
    );
}

export default function HistoryPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white p-10">Laddar...</div>}>
            <HistoryContent />
        </Suspense>
    )
}

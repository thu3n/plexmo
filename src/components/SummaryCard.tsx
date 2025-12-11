import { ReactNode } from "react";

export const SummaryCard = ({
    label,
    value,
    detail,
    accent,
    icon,
}: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    accent: string;
    icon: ReactNode;
}) => (
    <div className="rounded-lg border border-white/10 bg-white/5 px-5 py-4 backdrop-blur transition hover:bg-white/10">
        <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg shadow-lg ${accent}`}>
            {icon}
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</p>
        <div className="mt-1 text-2xl font-bold text-white">{value}</div>
        {detail ? <div className="mt-1 text-xs font-medium text-white/50">{detail}</div> : null}
    </div>
);

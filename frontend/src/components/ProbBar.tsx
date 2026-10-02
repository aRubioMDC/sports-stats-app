import type { ReactNode } from "react";

/** Labeled probability bar. `marketPct` adds a tick and a reference label for the de-vigged market price. */
export function ProbBar({
  label,
  pct,
  color,
  marketPct,
  footer,
}: {
  label: string;
  pct: number;
  color: string;
  marketPct?: number | null;
  footer?: ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-white/70">{label}</span>
        <span className="font-semibold text-white">{Math.round(pct * 100)}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
        {marketPct != null && (
          <div
            aria-hidden="true"
            className="absolute top-0 h-full w-0.5 bg-white/80"
            style={{ left: `calc(${marketPct * 100}% - 1px)` }}
          />
        )}
      </div>
      {(marketPct != null || footer) && (
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/40">
          <span>{marketPct != null ? `Market ${Math.round(marketPct * 100)}%` : ""}</span>
          {footer}
        </div>
      )}
    </div>
  );
}

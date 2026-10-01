/** Thin de-vigged-probability bar — real consensus market probability, never a model guess.
 * Extracted from GameDetail.tsx for reuse/testability. */
export function ProbBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-white/70">{label}</span>
        <span className="font-semibold text-white">{Math.round(pct * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

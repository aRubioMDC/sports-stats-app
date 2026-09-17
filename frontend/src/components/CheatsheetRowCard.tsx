import type { CheatsheetRow } from "../api";

const STAT_LABELS: Record<string, string> = {
  receptions: "Receptions",
  receiving_yards: "Rec Yards",
  rushing_yards: "Rush Yards",
  passing_yards: "Pass Yards",
};

export function CheatsheetRowCard({ row }: { row: CheatsheetRow }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#12141a] px-4 py-3">
      <div>
        <div className="font-semibold text-white">{row.player_name}</div>
        <div className="text-xs text-white/40">{row.team}</div>
      </div>
      <div className="text-right">
        <div className="text-sm text-white/80">
          {row.direction === "over" ? "Over" : "Under"} {row.threshold} {STAT_LABELS[row.stat_name] ?? row.stat_name}
        </div>
        <div className="text-xs font-semibold text-emerald-400">
          {row.hits}/{row.games} ({Math.round(row.hit_rate * 100)}%)
        </div>
      </div>
    </div>
  );
}

import type { CheatsheetRow } from "../api";
import { formatTrendLine } from "../lib/statLabels";

interface CheatsheetRowCardProps {
  row: CheatsheetRow;
  teamLogos?: Record<string, { logoUrl: string; primaryColor: string }>;
}

export function CheatsheetRowCard({ row, teamLogos }: CheatsheetRowCardProps) {
  const teamLogo = teamLogos?.[row.team];
  
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#12141a] px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        {teamLogo?.logoUrl ? (
          <img src={teamLogo.logoUrl} alt={row.team} className="h-6 w-6 shrink-0 object-contain" />
        ) : (
          <div className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
        )}
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{row.player_name}</div>
          <div className="text-xs text-white/40">{row.team}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm text-white/80">{formatTrendLine(row.stat_name, row.threshold, row.direction)}</div>
        <div className="text-xs font-semibold text-emerald-400">
          {row.hits}/{row.games} ({Math.round(row.hit_rate * 100)}%)
        </div>
      </div>
    </div>
  );
}

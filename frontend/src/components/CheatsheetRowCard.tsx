import { Link } from "react-router-dom";
import type { CheatsheetRow } from "../api";
import { formatTrendLine } from "../lib/statLabels";
import { useBankroll } from "../lib/bankroll";
import { getSignalBadges } from "../lib/signal-helpers";

interface CheatsheetRowCardProps {
  row: CheatsheetRow;
  teamLogos?: Record<string, { logoUrl: string; primaryColor: string }>;
}

export function CheatsheetRowCard({ row, teamLogos }: CheatsheetRowCardProps) {
  const teamLogo = teamLogos?.[row.team];
  const signals = getSignalBadges(row);
  const opponentLine = row.opponent_team ? `${row.is_home ? "vs" : "@"} ${row.opponent_team}` : row.team;
  const { bankroll } = useBankroll();

  return (
    <div className="group relative rounded-lg border border-white/10 bg-[#12141a] p-4 transition hover:border-emerald-400/30">
      {/* Player Info */}
      <div className="mb-2 flex items-center gap-2">
        {teamLogo?.logoUrl ? (
          <img src={teamLogo.logoUrl} alt={row.team} className="h-7 w-7 shrink-0 object-contain" />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
        )}
        <div className="min-w-0 flex-1">
          {row.player_id != null ? (
            <Link
              to={`/players/${row.player_id}`}
              className="font-semibold text-white text-sm truncate hover:text-emerald-400 hover:underline block"
            >
              {row.player_name}
            </Link>
          ) : (
            <div className="font-semibold text-white text-sm truncate">{row.player_name}</div>
          )}
          <div className="text-xs text-white/50">{opponentLine}</div>
        </div>
      </div>

      {/* Stat Line */}
      <div className="mb-3 text-sm font-semibold text-white">
        {formatTrendLine(row.stat_name, row.threshold, row.direction)}
      </div>

      {/* Signal rows — flat list, matching Linemate's compact style */}
      <div className="space-y-1.5">
        {signals.map((signal, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0">{signal.icon}</span>
              <span className="text-white/70 truncate">
                {signal.context}
                {signal.confidenceRange && (
                  <span className="ml-1.5 text-white/35">({signal.confidenceRange})</span>
                )}
              </span>
            </div>
            <span className="font-bold text-white shrink-0">{signal.valueLabel ?? `${signal.percentage}%`}</span>
          </div>
        ))}
      </div>

      {/* Real market comparison — only rendered when we have an actual matching
          sportsbook quote (never fabricated); edge can be negative, unlike the
          signal badges above, since this is grading against the real line. */}
      {row.market_line != null && row.edge != null && row.market_hits != null && row.market_games != null && (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-white/50 truncate">
              Book: {row.direction === "over" ? "Over" : "Under"} {row.market_line} ({row.market_price! > 0 ? "+" : ""}
              {row.market_price}) — hit {row.market_hits} of {row.market_games}
            </span>
            <span
              className={`shrink-0 font-bold ${row.edge >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {row.edge >= 0 ? "+" : ""}
              {Math.round(row.edge * 100)}% edge
            </span>
          </div>
          {row.market_opening_line != null && row.market_opening_line !== row.market_line && (
            <div className="mt-1 text-[11px] text-white/40">
              Line moved: {row.market_opening_line} → {row.market_line}{" "}
              {row.market_line > row.market_opening_line ? "↑" : "↓"}
            </div>
          )}
          {/* Quarter-Kelly suggested stake — only shown for a genuine positive
              edge, sized off the conservative CI lower bound, never off the
              raw point estimate. Bankroll is a session-local input, not real
              money tracking. */}
          {row.kelly_fraction != null && row.kelly_fraction > 0 && (
            <div className="mt-1 text-[11px] text-emerald-400/80">
              Suggested stake: ${(bankroll * row.kelly_fraction).toFixed(2)} ({(row.kelly_fraction * 100).toFixed(1)}% of bankroll, ¼-Kelly)
            </div>
          )}
        </div>
      )}
    </div>
  );
}


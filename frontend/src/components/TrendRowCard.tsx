import { useState } from "react";
import type { CheatsheetRow } from "../api";
import { formatTrendLine, ordinal } from "../lib/statLabels";
import { useBankroll } from "../lib/bankroll";
import { getConfidence, getKickoffLabel, getMatchupLabel, isOpponentRankEdge } from "../lib/signal-helpers";

interface TrendRowCardProps {
  row: CheatsheetRow;
  onSelect: () => void;
  teamLogos: Record<string, { logoUrl: string; primaryColor: string }>;
}

/** Trends-page card summarizing one signal — extracted from Trends.tsx so it's
 * reusable/testable independent of the page's filter/sort state. */
export function TrendRowCard({ row, onSelect, teamLogos }: TrendRowCardProps) {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const { bankroll } = useBankroll();

  const confidenceColors = {
    high: "bg-emerald-500/20 border-emerald-500/50 text-emerald-200",
    medium: "bg-amber-500/20 border-amber-500/50 text-amber-200",
    low: "bg-rose-500/20 border-rose-500/50 text-rose-200",
  };

  const confidence = getConfidence(row);
  const matchup = getMatchupLabel(row);
  const kickoff = getKickoffLabel(row);
  const teamLogo = teamLogos[row.team];

  const showCI = row.games < 8 && row.hit_rate_ci_low != null && row.hit_rate_ci_high != null;
  const splitPct = row.split_games ? Math.round(((row.split_hits ?? 0) / row.split_games) * 100) : null;
  const h2hPct = row.h2h_games ? Math.round(((row.h2h_hits ?? 0) / row.h2h_games) * 100) : null;
  const injuryPct = row.without_player_games
    ? Math.round(((row.without_player_hits ?? 0) / row.without_player_games) * 100)
    : null;
  const opponentEdge = isOpponentRankEdge(row);
  const hasContextSignal = (splitPct != null && splitPct >= 50) || (h2hPct != null && h2hPct >= 50) || (injuryPct != null && injuryPct >= 50) || opponentEdge;

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-2xl border border-white/10 bg-[#111620] p-4 transition hover:border-white/20 hover:bg-white/5"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {teamLogo?.logoUrl ? (
            <img src={teamLogo.logoUrl} alt={row.team} className="h-8 w-8 shrink-0 object-contain" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{row.player_name}</span>
              <span className="text-xs text-white/50 font-semibold">{row.team}</span>
            </div>
            {kickoff && <div className="text-xs text-white/40">{kickoff}</div>}
          </div>
        </div>
        <div className="text-right text-xs font-semibold text-white/70">{matchup ?? "No upcoming game"}</div>
      </div>

      {/* Stat Label */}
      <div className="mb-3 rounded-lg bg-white/5 px-3 py-2">
        <div className="text-sm font-semibold text-white">{formatTrendLine(row.stat_name, row.threshold, row.direction)}</div>
      </div>

      {/* Hit Rate and Confidence */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-black text-emerald-400">{Math.round(row.hit_rate * 100)}%</div>
          <div className="text-xs text-white/50">
            {row.hits}/{row.games} games
            {showCI && (
              <span className="ml-1 text-white/35">
                (95% CI {Math.round((row.hit_rate_ci_low ?? 0) * 100)}–{Math.round((row.hit_rate_ci_high ?? 0) * 100)}%)
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfidenceInfo(!showConfidenceInfo);
            }}
            className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${confidenceColors[confidence.level]}`}
          >
            {confidence.label}
          </button>
          {showConfidenceInfo && (
            <div className="absolute right-0 top-full mt-2 z-10 w-64 rounded-lg border border-white/20 bg-[#0f1117] p-3 text-xs text-white/80 shadow-lg">
              <div className="mb-2 font-semibold text-white">Why this confidence?</div>
              <div className="space-y-1">
                <div>
                  {confidence.ciWidthPct != null
                    ? `95% confidence interval spans ${confidence.ciWidthPct} points.`
                    : "Confidence interval unavailable."}
                </div>
                <div>
                  {confidence.signalCount} confirming real signal{confidence.signalCount === 1 ? "" : "s"} (split /
                  H2H / injury / opponent rank / market edge).
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Real contextual signals */}
      <div className="space-y-1.5 border-t border-white/10 pt-3 text-xs">
        {splitPct != null && splitPct >= 50 && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">📍 {row.is_home ? "Home" : "Away"} Split</span>
            <span className="font-semibold text-white">
              {splitPct}% ({row.split_hits}/{row.split_games})
            </span>
          </div>
        )}
        {h2hPct != null && h2hPct >= 50 && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">🎯 vs {row.opponent_team ?? "Opponent"}</span>
            <span className="font-semibold text-white">
              {h2hPct}% ({row.h2h_hits}/{row.h2h_games})
            </span>
          </div>
        )}
        {injuryPct != null && injuryPct >= 50 && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">🩹 Without {row.without_player}</span>
            <span className="font-semibold text-white">
              {injuryPct}% ({row.without_player_hits}/{row.without_player_games})
            </span>
          </div>
        )}
        {opponentEdge && row.opponent_rank != null && row.opponent_team_count && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">🏆 {row.opponent_team} Matchup Rank</span>
            <span className="font-semibold text-white">
              {ordinal(row.opponent_rank)} of {row.opponent_team_count}
            </span>
          </div>
        )}
        {!hasContextSignal && <div className="text-white/30">No confirming contextual signals yet.</div>}
      </div>

      {/* Real market comparison — only when a real matching sportsbook quote exists */}
      {row.market_line != null && row.edge != null && row.market_hits != null && row.market_games != null && (
        <div className="mt-3 border-t border-white/10 pt-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-white/50">
              Book: {row.direction === "over" ? "Over" : "Under"} {row.market_line} ({row.market_price! > 0 ? "+" : ""}
              {row.market_price}) — hit {row.market_hits}/{row.market_games}
            </span>
            <span className={`shrink-0 font-bold ${row.edge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {row.edge >= 0 ? "+" : ""}
              {Math.round(row.edge * 100)}% edge
            </span>
          </div>
          {row.kelly_fraction != null && row.kelly_fraction > 0 && (
            <div className="mt-1 text-emerald-400/80">
              Suggested stake: ${(bankroll * row.kelly_fraction).toFixed(2)} ({(row.kelly_fraction * 100).toFixed(1)}%
              bankroll, ¼-Kelly)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

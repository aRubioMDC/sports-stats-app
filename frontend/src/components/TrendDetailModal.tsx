import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import type { CheatsheetRow } from "../api";
import { formatTrendLine, ordinal, pctColorClass } from "../lib/statLabels";
import { useBankroll } from "../lib/bankroll";
import { getConfidence, getKickoffLabel, getMatchupLabel, getSignalChecklist } from "../lib/signal-helpers";
import type { SignalChecklistItem } from "../lib/signal-helpers";

interface TrendDetailModalProps {
  row: CheatsheetRow;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  position: { index: number; total: number };
  teamLogos: Record<string, { logoUrl: string; primaryColor: string }>;
}

const SIGNAL_STATUS_STYLES: Record<SignalChecklistItem["status"], string> = {
  confirming: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  present: "border-amber-500/20 bg-amber-500/5 text-amber-200/80",
  none: "border-white/5 bg-white/[0.02] text-white/30",
};

/** Full-detail trend view opened from a TrendRowCard — extracted from
 * Trends.tsx so it's reusable/testable independent of the page's state. */
export function TrendDetailModal({ row, onClose, onPrev, onNext, hasPrev, hasNext, position, teamLogos }: TrendDetailModalProps) {
  const { bankroll } = useBankroll();
  const confidence = getConfidence(row);
  const matchup = getMatchupLabel(row);
  const kickoff = getKickoffLabel(row);
  const teamLogo = teamLogos[row.team];
  const checklist = useMemo(() => getSignalChecklist(row), [row]);

  // Escape to close, arrow keys to step through the current filtered list —
  // and lock body scroll so the page behind the modal doesn't scroll with it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  // Full transparency here (unlike the card badges): show the real split/H2H
  // numbers whenever present, even if they don't confirm the pick — omitting
  // an unfavorable real number would itself be a form of fabrication by omission.
  const hasSplit = row.split_games != null && row.split_games > 0;
  const hasH2h = row.h2h_games != null && row.h2h_games > 0;
  const hasInjury = row.without_player_games != null && row.without_player_games > 0;
  const hasOpponentRank = row.opponent_rank != null && row.opponent_team_count != null;
  const hasMarket = row.market_line != null && row.market_hits != null && row.market_games != null;
  const splitPct = hasSplit ? Math.round(((row.split_hits ?? 0) / (row.split_games ?? 1)) * 100) : null;
  const h2hPct = hasH2h ? Math.round(((row.h2h_hits ?? 0) / (row.h2h_games ?? 1)) * 100) : null;
  const injuryPct = hasInjury
    ? Math.round(((row.without_player_hits ?? 0) / (row.without_player_games ?? 1)) * 100)
    : null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${row.player_name} trend detail`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Previous trend"
          className="fixed left-4 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/10 bg-[#111620] p-3 text-xl text-white/60 transition hover:border-white/30 hover:text-white sm:block"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Next trend"
          className="fixed right-4 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/10 bg-[#111620] p-3 text-xl text-white/60 transition hover:border-white/30 hover:text-white sm:block"
        >
          ›
        </button>
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[modalPop_0.18s_ease-out] max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl"
      >
        {/* Sticky header — stays visible while scrolling the sections below */}
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0f1117]/95 p-6 pb-4 backdrop-blur">
          <div className="mb-1 flex items-center justify-between text-xs text-white/40">
            <span>
              Trend {position.index + 1} of {position.total}
            </span>
            <span className="sm:hidden">Swipe not supported — use ‹ › buttons or arrow keys</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {teamLogo?.logoUrl ? (
                <img src={teamLogo.logoUrl} alt={row.team} className="h-12 w-12 shrink-0 object-contain" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
              )}
              <div>
                {row.player_id != null ? (
                  <Link
                    to={`/players/${row.player_id}`}
                    className="text-2xl font-black leading-tight text-white hover:text-emerald-400 hover:underline sm:text-3xl"
                  >
                    {row.player_name}
                  </Link>
                ) : (
                  <h1 className="text-2xl font-black leading-tight text-white sm:text-3xl">{row.player_name}</h1>
                )}
                <p className="text-sm text-white/60">
                  {row.team} • {matchup ?? "No upcoming game"}
                  {kickoff && ` • ${kickoff}`}
                </p>
                <div className="mt-2 inline-block rounded-lg bg-white/5 px-3 py-1.5">
                  <p className="text-sm font-semibold text-white">
                    {formatTrendLine(row.stat_name, row.threshold, row.direction)}
                  </p>
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="shrink-0 text-2xl text-white/40 hover:text-white">
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 pt-4">
          {/* Recent Form (always real, always present) */}
          <div className="mb-6 rounded-lg border border-white/10 bg-[#111620] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/60">Recent Form</h3>
            <div className="flex items-baseline gap-3">
              <div className={`text-3xl font-black ${pctColorClass(row.hit_rate * 100)}`}>
                {Math.round(row.hit_rate * 100)}%
              </div>
              <p className="text-white/80">
                Hit in {row.hits} of last {row.games} games
                {row.hit_rate_ci_low != null && row.hit_rate_ci_high != null && (
                  <span className="ml-1 text-white/40">
                    (95% CI {Math.round(row.hit_rate_ci_low * 100)}–{Math.round(row.hit_rate_ci_high * 100)}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Home/Away & Head-to-Head */}
          {(hasSplit || hasH2h) && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {hasSplit && (
                <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white/60">{row.is_home ? "Home" : "Away"} Split</h3>
                  <div className={`text-2xl font-black ${pctColorClass(splitPct ?? 0)}`}>{splitPct}%</div>
                  <p className="mt-1 text-sm text-white/70">
                    {row.split_hits} of {row.split_games} {row.is_home ? "home" : "away"} games
                  </p>
                </div>
              )}
              {hasH2h && (
                <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white/60">vs {row.opponent_team ?? "Opponent"}</h3>
                  <div className={`text-2xl font-black ${pctColorClass(h2hPct ?? 0)}`}>{h2hPct}%</div>
                  <p className="mt-1 text-sm text-white/70">
                    {row.h2h_hits} of {row.h2h_games} past matchups
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Injury impact & Opponent rank */}
          {(hasInjury || hasOpponentRank) && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {hasInjury && (
                <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white/60">Without {row.without_player}</h3>
                  <div className={`text-2xl font-black ${pctColorClass(injuryPct ?? 0)}`}>{injuryPct}%</div>
                  <p className="mt-1 text-sm text-white/70">
                    {row.without_player_hits} of {row.without_player_games} games missed by teammate
                  </p>
                </div>
              )}
              {hasOpponentRank && (
                <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white/60">{row.opponent_team ?? "Opponent"} Defensive Rank</h3>
                  <div className="text-2xl font-black text-white">{ordinal(row.opponent_rank!)}</div>
                  <p className="mt-1 text-sm text-white/70">of {row.opponent_team_count} teams</p>
                </div>
              )}
            </div>
          )}

          {/* Real market comparison */}
          {hasMarket && (
            <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <h3 className="mb-3 text-sm font-semibold text-white/60">Market Line</h3>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="mb-1 text-sm text-white/60">Line / Price</div>
                  <div className="text-xl font-black text-white">
                    {row.direction === "over" ? "Over" : "Under"} {row.market_line} (
                    {row.market_price! > 0 ? "+" : ""}
                    {row.market_price})
                  </div>
                  {row.market_opening_line != null && row.market_opening_line !== row.market_line && (
                    <div className="mt-1 text-xs text-white/40">
                      Line moved: {row.market_opening_line} → {row.market_line}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-sm text-white/60">Recomputed Hit Rate</div>
                  <div className="text-xl font-black text-white">
                    {row.market_hits}/{row.market_games}
                  </div>
                </div>
                {row.edge != null && (
                  <div>
                    <div className="mb-1 text-sm text-white/60">Edge</div>
                    <div className={`text-xl font-black ${row.edge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {row.edge >= 0 ? "+" : ""}
                      {Math.round(row.edge * 100)}%
                    </div>
                  </div>
                )}
              </div>
              {row.kelly_fraction != null && row.kelly_fraction > 0 && (
                <div className="mt-3 text-sm text-emerald-400/80">
                  Suggested stake: ${(bankroll * row.kelly_fraction).toFixed(2)} ({(row.kelly_fraction * 100).toFixed(1)}%
                  of bankroll, ¼-Kelly)
                </div>
              )}
            </div>
          )}

          {/* Confidence + full real-signal checklist (every category shown, even
              when the real number doesn't confirm the pick or no data exists) */}
          <div className="mb-2 rounded-lg border border-white/10 bg-[#111620] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/60">Signal Checklist</h3>
              <span
                className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                  confidence.level === "high"
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200"
                    : confidence.level === "medium"
                      ? "border-amber-500/50 bg-amber-500/20 text-amber-200"
                      : "border-rose-500/50 bg-rose-500/20 text-rose-200"
                }`}
              >
                {confidence.label}
              </span>
            </div>
            <p className="mb-3 text-xs text-white/40">
              {confidence.ciWidthPct != null
                ? `95% confidence interval spans ${confidence.ciWidthPct} points.`
                : "Confidence interval unavailable for this sample."}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${SIGNAL_STATUS_STYLES[item.status]}`}
                >
                  <span className="truncate">
                    {item.status === "confirming" ? "✅" : item.status === "present" ? "➖" : "⚪"} {item.icon}{" "}
                    {item.label}
                  </span>
                  <span className="shrink-0 font-semibold">{item.detail ?? "No data"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex gap-3 border-t border-white/10 p-6 pt-4">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ‹ Previous
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/5"
          >
            Close
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}

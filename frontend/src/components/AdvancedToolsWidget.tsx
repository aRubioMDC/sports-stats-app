import { useState } from "react";
import type { CheatsheetRow } from "../api";
import { formatTrendLine, ordinal, STAT_LABELS } from "../lib/statLabels";
import { Select } from "./Select";

// Fase 4 candidate: PREMIUM_CANDIDATE_FEATURES=["advanced_tools"] on the backend.
// No gating today — free for everyone until Fase 4 traction validation.
type Mode = "injuries" | "opponent_rank";

/** A lone 4th/5th card leaves a ragged last row in the 3-col grid — only ever show
 * a clean 3 or 6 cards, hiding the rest rather than an unbalanced count. */
function trimToGrid(rows: CheatsheetRow[]): CheatsheetRow[] {
  if (rows.length >= 6) return rows.slice(0, 6);
  if (rows.length >= 3) return rows.slice(0, 3);
  return [];
}

/** Linemate-style "Advanced Tools" widget — Injuries (teammate-absence usage
 * bumps, derived from real roster participation) and Opponent Rank (upcoming
 * opponent has one of the worst/best defenses vs that stat). */
export function AdvancedToolsWidget({
  injuryRows,
  opponentRankRows,
  teamLogos,
}: {
  injuryRows: CheatsheetRow[];
  opponentRankRows: CheatsheetRow[];
  teamLogos?: Record<string, { logoUrl: string; primaryColor: string }>;
}) {
  const injuryCards = trimToGrid(injuryRows);
  const opponentRankCards = trimToGrid(opponentRankRows);
  const available: Mode[] = [
    ...(injuryCards.length > 0 ? (["injuries"] as Mode[]) : []),
    ...(opponentRankCards.length > 0 ? (["opponent_rank"] as Mode[]) : []),
  ];
  const [mode, setMode] = useState<Mode>(available[0] ?? "injuries");

  if (available.length === 0) return null;
  const rows = mode === "injuries" ? injuryCards : opponentRankCards;
  const isInjuryMode = mode === "injuries";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Advanced Tools for</h2>
        {available.length > 1 ? (
          <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {injuryCards.length > 0 && <option value="injuries">Injuries</option>}
            {opponentRankCards.length > 0 && <option value="opponent_rank">Opponent Rank</option>}
          </Select>
        ) : (
          <span className="rounded-full border border-white/10 bg-[#12141a] px-3 py-1.5 text-sm font-semibold text-white/80">
            {isInjuryMode ? "Injuries" : "Opponent Rank"}
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-white/50">
        {isInjuryMode
          ? "See how a teammate's absence boosts this player's usage."
          : "Players whose upcoming opponent has one of the league's worst defenses against that stat."}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((row, i) => {
          const teamLogo = teamLogos?.[row.team];
          const hitPercentage = Math.round(row.hit_rate * 100);
          const opponentLine = row.opponent_team ? `${row.is_home ? "vs" : "@"} ${row.opponent_team}` : row.team;

          const isOver = row.direction !== "under";
          const teamCount = row.opponent_team_count ?? 32;
          const rank = row.opponent_rank ?? 0;
          // Rank 1 = best defense, teamCount = worst — flip it for the
          // "over" case so 1 always means "the strongest edge" here.
          const edgeRank = isOver ? teamCount - rank + 1 : rank;
          const statLabel = STAT_LABELS[row.stat_name] ?? row.stat_name;
          const opponentAbbr = row.opponent_team ?? "Opponent";
          const injuryPercentage =
            row.without_player_games ? Math.round(((row.without_player_hits ?? 0) / row.without_player_games) * 100) : 0;

          return (
            <div key={i} className="group rounded-lg border border-white/10 bg-[#12141a] p-4 transition hover:border-emerald-400/40">
              {/* Header */}
              <div className="mb-2 flex items-center gap-2">
                {teamLogo?.logoUrl ? (
                  <img src={teamLogo.logoUrl} alt={row.team} className="h-7 w-7 shrink-0 object-contain" />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white truncate text-sm">{row.player_name}</div>
                  <div className="text-xs text-white/50">{opponentLine}</div>
                </div>
              </div>

              {/* Stat Line */}
              <div className="mb-3 text-sm font-semibold text-white">
                {formatTrendLine(row.stat_name, row.threshold, row.direction)}
              </div>

              {/* Signal rows — flat list, matching Linemate's compact style */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">🔥</span>
                    <span className="text-white/70 truncate">Hit in {row.hits} of last {row.games} games</span>
                  </div>
                  <span className="font-bold text-white shrink-0">{hitPercentage}%</span>
                </div>
                {isInjuryMode ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0">🩹</span>
                      <span className="text-white/70 truncate">
                        Hit in {row.without_player_hits} of last {row.without_player_games} games without <span className="font-semibold text-white">{row.without_player}</span>
                      </span>
                    </div>
                    <span className="font-bold text-white shrink-0">{injuryPercentage}%</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0">🏆</span>
                      <span className="text-white/70 truncate">
                        <span className="font-semibold text-white">{opponentAbbr}</span> is a good {statLabel} matchup
                      </span>
                    </div>
                    <span className="font-bold text-white shrink-0">{ordinal(edgeRank)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

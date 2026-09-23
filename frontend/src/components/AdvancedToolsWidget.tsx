import { useState } from "react";
import type { CheatsheetRow } from "../api";
import { formatTrendLine } from "../lib/statLabels";
import { Select } from "./Select";

// Fase 4 candidate: PREMIUM_CANDIDATE_FEATURES=["advanced_tools"] on the backend.
// No gating today — free for everyone until Fase 4 traction validation.
type Mode = "injuries" | "opponent_rank";

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** A lone 4th/5th card leaves a ragged last row in the 3-col grid — only ever show
 * a clean 3 or 6 cards, hiding the rest rather than an unbalanced count. */
function trimToGrid(rows: CheatsheetRow[]): CheatsheetRow[] {
  if (rows.length >= 6) return rows.slice(0, 6);
  if (rows.length >= 3) return rows.slice(0, 3);
  return [];
}

/** Linemate-style "Advanced Tools" widget — switches between Injuries (teammate-absence
 * splits) and Opponent Rank (upcoming opponent has one of the worst defenses vs that stat). */
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

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Advanced Tools for</h2>
        <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          {injuryCards.length > 0 && <option value="injuries">Injuries</option>}
          {opponentRankCards.length > 0 && <option value="opponent_rank">Opponent Rank</option>}
        </Select>
      </div>
      <p className="mb-3 text-sm text-white/50">
        {mode === "injuries"
          ? "See how a teammate's absence impacts other players."
          : "Players whose upcoming opponent has one of the league's worst defenses against that stat."}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((row, i) => {
          const teamLogo = teamLogos?.[row.team];
          const hitPercentage = Math.round(row.hit_rate * 100);
          const isInjury = mode === "injuries";
          
          return (
            <div key={i} className="group rounded-xl border border-white/10 bg-gradient-to-br from-[#12141a] to-[#0f1116] p-4 transition hover:border-emerald-400/40 hover:shadow-lg hover:shadow-emerald-400/10">
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {teamLogo?.logoUrl ? (
                    <img src={teamLogo.logoUrl} alt={row.team} className="h-7 w-7 shrink-0 object-contain mt-0.5" />
                  ) : (
                    <div className="h-7 w-7 shrink-0 rounded-full mt-0.5" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate text-sm">{row.player_name}</div>
                    <div className="text-xs text-white/50">{row.team}</div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs font-bold px-2 py-1 rounded-full" style={{
                    backgroundColor: hitPercentage === 100 ? "rgba(234, 179, 8, 0.1)" : "rgba(16, 185, 129, 0.1)",
                    color: hitPercentage === 100 ? "#eab308" : "#10b981"
                  }}>
                    {hitPercentage}%
                  </div>
                </div>
              </div>
              
              {/* Stat Line */}
              <div className="mb-3 p-2.5 rounded-lg bg-white/5 border border-white/5">
                <div className="text-xs text-white/50 mb-0.5">Prop:</div>
                <div className="font-semibold text-white text-sm">
                  {formatTrendLine(row.stat_name, row.threshold, row.direction)}
                </div>
              </div>
              
              {/* Context Section */}
              {isInjury ? (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-400/20">
                    <div className="text-xs text-yellow-400/80 mb-1 font-semibold">🩹 Injury Impact</div>
                    <div className="text-xs text-white/70">
                      {row.hits}/{row.games} hits without <span className="font-semibold text-white">{row.without_player}</span>
                    </div>
                  </div>
                  <div className="text-xs text-white/50 leading-relaxed">
                    Performance significantly improves when {row.without_player} is unavailable. Strong positive correlation with this player's production.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-400/20">
                    <div className="text-xs text-blue-400/80 mb-1 font-semibold">🏆 Matchup Edge</div>
                    <div className="text-xs text-white/70">
                      Opponent ranks <span className="font-semibold text-white">{ordinal(row.opponent_rank ?? 0)}</span> of {row.opponent_team_count} vs {row.stat_name}
                    </div>
                  </div>
                  <div className="text-xs text-white/50 leading-relaxed">
                    Facing one of the worst defenses in the league for this stat category. Favorable setup for production.
                  </div>
                </div>
              )}
              
              {/* Performance Indicator */}
              <div className="mt-3 pt-2.5 border-t border-white/10">
                <div className="text-xs text-white/60">
                  Recent form: <span className="font-semibold text-white">{row.hits}/{row.games} games</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

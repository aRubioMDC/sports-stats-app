import { useState } from "react";
import type { CheatsheetRow } from "../api";
import { formatTrendLine } from "../lib/statLabels";

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
}: {
  injuryRows: CheatsheetRow[];
  opponentRankRows: CheatsheetRow[];
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
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-full border border-white/10 bg-[#12141a] px-3 py-1 text-sm font-semibold text-white/80"
        >
          {injuryCards.length > 0 && <option value="injuries">Injuries</option>}
          {opponentRankCards.length > 0 && <option value="opponent_rank">Opponent Rank</option>}
        </select>
      </div>
      <p className="mb-3 text-sm text-white/50">
        {mode === "injuries"
          ? "See how a teammate's absence impacts other players."
          : "Players whose upcoming opponent has one of the league's worst defenses against that stat."}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-[#12141a] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">{row.player_name}</div>
                <div className="text-xs text-white/40">{row.team}</div>
              </div>
              <span className="text-sm font-semibold text-white/80">
                {formatTrendLine(row.stat_name, row.threshold, row.direction)}
              </span>
            </div>
            {mode === "injuries" ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span>🩹</span>
                <span className="text-white/60">
                  Hit in {row.hits} of last {row.games} games without {row.without_player}
                </span>
                <span className="ml-auto font-semibold text-emerald-400">{Math.round(row.hit_rate * 100)}%</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs">
                <span>🏆</span>
                <span className="text-white/60">
                  Good matchup {"\u2014"} opponent ranks {ordinal(row.opponent_rank ?? 0)} of {row.opponent_team_count} vs this stat
                </span>
                <span className="ml-auto font-semibold text-emerald-400">{row.hits}/{row.games}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

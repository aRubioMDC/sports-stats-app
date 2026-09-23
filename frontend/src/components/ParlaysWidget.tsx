import { useEffect, useState } from "react";
import type { Game, Parlay } from "../api";
import { formatTrendLine } from "../lib/statLabels";
import { Select } from "./Select";

/** Linemate-style "Parlays for X @ Y" widget — a dropdown to switch games, and a
 * carousel (‹ N / total ›) to page through that game's several parlay slates.
 * Fase 4 candidate: PREMIUM_CANDIDATE_FEATURES=["parlays"] on the backend — no
 * gating today, free for everyone until Fase 4 traction validation. */
export function ParlaysWidget({
  game,
  parlays,
  games,
  onSelectGame,
}: {
  game: Game;
  parlays: Parlay[];
  games: Game[];
  onSelectGame: (gameId: number) => void;
}) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [game.id]);

  if (parlays.length === 0) return null;
  const current = parlays[Math.min(page, parlays.length - 1)];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Parlays for</h2>
        <Select value={game.id} onChange={(e) => onSelectGame(Number(e.target.value))}>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.away_team.abbreviation} @ {g.home_team.abbreviation}
            </option>
          ))}
        </Select>
      </div>
      <div className="rounded-xl border border-white/10 bg-[#12141a] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {game.away_team.logo_url ? (
              <img src={game.away_team.logo_url} alt={game.away_team.abbreviation} className="h-6 w-6 shrink-0 object-contain" />
            ) : (
              <div className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: game.away_team.primary_color }} />
            )}
            <span className="text-sm font-semibold text-white/70 truncate">{game.away_team.abbreviation}</span>
            <span className="text-white/40 shrink-0">@</span>
            <span className="text-sm font-semibold text-white/70 truncate">{game.home_team.abbreviation}</span>
            {game.home_team.logo_url ? (
              <img src={game.home_team.logo_url} alt={game.home_team.abbreviation} className="h-6 w-6 shrink-0 object-contain" />
            ) : (
              <div className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: game.home_team.primary_color }} />
            )}
          </div>
          {parlays.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous parlay"
                className="rounded-full border border-white/10 px-2 py-0.5 text-white/60 transition hover:border-sky-400/40 hover:text-sky-400 disabled:opacity-30"
              >
                ‹
              </button>
              <span>
                {page + 1} / {parlays.length}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(parlays.length - 1, p + 1))}
                disabled={page === parlays.length - 1}
                aria-label="Next parlay"
                className="rounded-full border border-white/10 px-2 py-0.5 text-white/60 transition hover:border-sky-400/40 hover:text-sky-400 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {current.legs.map((leg, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
              <div>
                <span className="font-semibold text-white">{leg.player_name}</span>
                <span className="ml-1 text-white/50">{formatTrendLine(leg.stat_name, leg.threshold, leg.direction)}</span>
              </div>
              <span className="text-xs font-semibold text-emerald-400">
                Hit in {leg.hits} of last {leg.games} games
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs font-semibold text-white/40">
          Each leg hit in {current.summary_hits} of last {current.summary_games} games
        </div>
      </div>
    </div>
  );
}


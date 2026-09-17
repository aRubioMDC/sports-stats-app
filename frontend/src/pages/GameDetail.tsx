import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { MatchupContext } from "../api";
import { MatchupComparisonCard } from "../components/MatchupComparisonCard";
import { HeadToHeadTable } from "../components/HeadToHeadTable";

export function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [context, setContext] = useState<MatchupContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    api
      .getMatchup(Number(gameId))
      .then(setContext)
      .catch(() => setError("Could not load matchup context."));
  }, [gameId]);

  if (error) return <p className="p-8 text-red-400">{error}</p>;
  if (!context) return <p className="p-8 text-white/50">Loading matchup…</p>;

  const { game, stat_rows, head_to_head, window_mode } = context;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-sky-400 hover:underline">
        ← Back to schedule
      </Link>

      <div className="mt-4 mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">
          {game.away_team.abbreviation} @ {game.home_team.abbreviation}
        </h1>
        {window_mode === "blended" && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
            Early season — stats blended with last season
          </span>
        )}
      </div>

      {stat_rows.length > 0 ? (
        <MatchupComparisonCard
          homeAbbr={game.home_team.abbreviation}
          awayAbbr={game.away_team.abbreviation}
          homeColor={game.home_team.primary_color}
          awayColor={game.away_team.primary_color}
          rows={stat_rows}
        />
      ) : (
        <p className="text-white/40">Matchup stats not available yet for these teams.</p>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
        Head to Head
      </h2>
      <HeadToHeadTable results={head_to_head} />
    </div>
  );
}

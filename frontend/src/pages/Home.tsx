import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Game } from "../api";

export function Home() {
  const [season, setSeason] = useState(2025);
  const [week, setWeek] = useState(1);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getGames(season, week)
      .then(setGames)
      .catch(() => setError("Could not load games for this week."))
      .finally(() => setLoading(false));
  }, [season, week]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-white">NFL Matchups &amp; Trends</h1>
      <p className="mb-6 text-sm text-white/50">
        Real season data · matchup context · player hit-rate trends
      </p>

      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm text-white/60">
          Season
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="ml-2 rounded border border-white/10 bg-[#12141a] px-2 py-1 text-white"
          >
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
        </label>
        <label className="text-sm text-white/60">
          Week
          <select
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="ml-2 rounded border border-white/10 bg-[#12141a] px-2 py-1 text-white"
          >
            {Array.from({ length: 22 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </label>
        <Link to="/cheatsheet" className="ml-auto text-sm font-semibold text-sky-400 hover:underline">
          Cheatsheet →
        </Link>
      </div>

      {loading && <p className="text-white/50">Loading games…</p>}
      {error && <p className="text-red-400">{error}</p>}

      <div className="space-y-2">
        {games.map((game) => (
          <Link
            key={game.id}
            to={`/games/${game.id}`}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-[#12141a] px-4 py-3 transition hover:border-sky-400/40"
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold text-white">{game.away_team.abbreviation}</span>
              <span className="text-white/30">@</span>
              <span className="font-semibold text-white">{game.home_team.abbreviation}</span>
            </div>
            <div className="text-sm text-white/50">
              {game.status === "final" ? `${game.away_score} - ${game.home_score}` : "Scheduled"}
            </div>
          </Link>
        ))}
        {!loading && games.length === 0 && !error && (
          <p className="text-white/40">No games found for this week.</p>
        )}
      </div>
    </div>
  );
}

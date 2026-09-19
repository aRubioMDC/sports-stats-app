import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { BoardGame, CheatsheetRow, Parlay, TrendGroups } from "../api";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";
import { MatchRow } from "../components/MatchRow";
import { CheatsheetGroups } from "../components/CheatsheetGroups";
import { AdvancedToolsWidget } from "../components/AdvancedToolsWidget";
import { ParlaysWidget } from "../components/ParlaysWidget";

type StatusFilter = "all" | "final" | "scheduled";

const GAMES_LIMIT = 5;

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Home() {
  const [season, setSeason] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("scheduled");
  const [trends, setTrends] = useState<CheatsheetRow[]>([]);
  const [trendGroups, setTrendGroups] = useState<TrendGroups | null>(null);
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [showAllGames, setShowAllGames] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.trackEvent("page_view_home");
    api
      .getConfig()
      .then((c) => {
        setSeason(c.current_season);
        setWeek(c.current_week);
        setLastUpdated(c.last_updated);
      })
      .catch(() => setError("Could not load current season."));
    api.getCheatsheet(1.0, 3).then((rows) => setTrends(rows.slice(0, 3))).catch(() => undefined);
    api.getTrendGroups().then(setTrendGroups).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (season === null || week === null) return;
    setLoading(true);
    setError(null);
    setShowAllGames(false);
    api
      .getBoard(season, week)
      .then((rows) => {
        setBoard(rows);
        const firstUpcoming = rows.find((r) => r.game.status !== "final") ?? rows[0];
        if (firstUpcoming) {
          setSelectedGameId(firstUpcoming.game.id);
          api.getParlays(firstUpcoming.game.id).then(setParlays).catch(() => undefined);
        } else {
          setSelectedGameId(null);
          setParlays([]);
        }
      })
      .catch(() => setError("Could not load games for this week."))
      .finally(() => setLoading(false));
  }, [season, week]);

  const finalCount = board.filter((r) => r.game.status === "final").length;
  const scheduledCount = board.length - finalCount;
  const visibleRows = board.filter((r) => {
    if (statusFilter === "final") return r.game.status === "final";
    if (statusFilter === "scheduled") return r.game.status !== "final";
    return true;
  });

  const totalWeeks = 22;
  let windowStart = Math.max(1, (week ?? 1) - 2);
  const windowEnd = Math.min(totalWeeks, windowStart + 4);
  windowStart = Math.max(1, windowEnd - 4);
  const visibleWeeks = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  const statusChip = (value: StatusFilter, label: string, count: number) => (
    <button
      type="button"
      onClick={() => {
        setStatusFilter(value);
        api.trackEvent("status_filter_change", { filter: value });
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        statusFilter === value
          ? "bg-white/15 text-white"
          : "bg-transparent text-white/40 hover:text-white/70"
      }`}
    >
      {label} <span className="text-white/30">{count}</span>
    </button>
  );

  const firstBoardGame = board.find((r) => r.game.id === selectedGameId) ?? board[0];

  const handleSelectParlayGame = (gameId: number) => {
    setSelectedGameId(gameId);
    api.trackEvent("parlays_switch_game", { gameId });
    api.getParlays(gameId).then(setParlays).catch(() => undefined);
  };

  const handleRefresh = () => {
    if (season === null || week === null || refreshing) return;
    setRefreshing(true);
    api.trackEvent("refresh_scores_click");
    api
      .refreshScores()
      .then((res) => setLastUpdated(res.last_updated))
      .then(() => api.getBoard(season, week))
      .then(setBoard)
      .catch(() => setError("Could not refresh scores."))
      .finally(() => setRefreshing(false));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Matches with the context that matters</h1>
        {season !== null && <span className="text-sm font-semibold text-white/40">{season} Season</span>}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-white/50">
          Recent form, matchup ranks, and hit-rate trends to quickly spot the games worth watching.
        </p>
        <div className="flex shrink-0 items-center gap-2 text-xs text-white/40">
          <span>Updated {formatRelativeTime(lastUpdated)}</span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-full border border-white/10 px-2.5 py-1 font-semibold text-white/60 transition hover:border-sky-400/40 hover:text-sky-400 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 gap-2">
          {visibleWeeks.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeek(w)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                w === week
                  ? "bg-sky-500 text-white"
                  : "bg-[#12141a] text-white/50 hover:bg-[#1a1d26] hover:text-white"
              }`}
            >
              Week {w}
            </button>
          ))}
        </div>
        <select
          value={week ?? ""}
          onChange={(e) => setWeek(Number(e.target.value))}
          title="Jump to week"
          aria-label="Jump to week"
          className="shrink-0 rounded-lg border border-white/10 bg-[#12141a] px-2 py-1.5 text-white/70"
        >
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              📅 Week {w}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-1">
          {statusChip("all", "All", board.length)}
          {statusChip("scheduled", "Upcoming", scheduledCount)}
          {statusChip("final", "Final", finalCount)}
        </div>
        {visibleRows.length > GAMES_LIMIT && (
          <button
            type="button"
            onClick={() => setShowAllGames((v) => !v)}
            className="text-sm font-semibold text-sky-400 hover:underline"
          >
            {showAllGames ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {loading && <p className="text-white/50">Loading games…</p>}
      {error && <p className="text-red-400">{error}</p>}

      <div className="flex flex-col gap-3">
        {(showAllGames ? visibleRows : visibleRows.slice(0, GAMES_LIMIT)).map((row, i) => (
          <div
            key={row.game.id}
            className="animate-[fadeInUp_0.35s_ease-out_backwards]"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <MatchRow row={row} />
          </div>
        ))}
        {!loading && visibleRows.length === 0 && !error && (
          <p className="text-white/40">No games found for this filter.</p>
        )}
      </div>

      {trends.length > 0 && (
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Trending Today</h2>
            <Link to="/cheatsheet" className="text-sm font-semibold text-sky-400 hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {trends.map((row, i) => (
              <CheatsheetRowCard key={`${row.player_name}-${row.stat_name}-${i}`} row={row} />
            ))}
          </div>
        </div>
      )}

      {trendGroups && (
        <div className="mt-10">
          <CheatsheetGroups
            recentForm={trendGroups.recent_form}
            versusOpponent={trendGroups.versus_opponent}
            alternateLines={trendGroups.alternate_lines}
            homeAwaySplits={trendGroups.home_away_splits}
            undersOnly={trendGroups.unders_only}
            teamForm={trendGroups.team_form}
          />
        </div>
      )}

      {trendGroups && (trendGroups.injury_impact.length > 0 || trendGroups.opponent_rank.length > 0) && (
        <div className="mt-10">
          <AdvancedToolsWidget injuryRows={trendGroups.injury_impact} opponentRankRows={trendGroups.opponent_rank} />
        </div>
      )}

      {firstBoardGame && parlays.length > 0 && (
        <div className="mt-10">
          <ParlaysWidget
            game={firstBoardGame.game}
            parlays={parlays}
            games={board.map((r) => r.game)}
            onSelectGame={handleSelectParlayGame}
          />
        </div>
      )}
    </div>
  );
}



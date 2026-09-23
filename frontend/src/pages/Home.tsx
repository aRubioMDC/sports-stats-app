import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { BoardGame, CheatsheetRow, Parlay, TrendGroups } from "../api";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";
import { MatchRow } from "../components/MatchRow";
import { CheatsheetGroups } from "../components/CheatsheetGroups";
import { AdvancedToolsWidget } from "../components/AdvancedToolsWidget";
import { ParlaysWidget } from "../components/ParlaysWidget";
import { Select } from "../components/Select";

type StatusFilter = "all" | "final" | "scheduled";

const GAMES_LIMIT = 6;

// Skeleton loader components
function MatchRowSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/10 bg-[#12141a] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-white/10" />
        <div className="h-4 w-16 rounded bg-white/10" />
      </div>
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/10" />
              <div className="h-4 w-20 rounded bg-white/10" />
            </div>
            <div className="h-4 w-12 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [teamSearch, setTeamSearch] = useState<string>("");

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
  
  // Filter by status first, then by team search
  const visibleRows = useMemo(() => {
    let filtered = board.filter((r) => {
      if (statusFilter === "final") return r.game.status === "final";
      if (statusFilter === "scheduled") return r.game.status !== "final";
      return true;
    });
    
    if (teamSearch.trim()) {
      const query = teamSearch.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.game.home_team.name.toLowerCase().includes(query) ||
          r.game.home_team.abbreviation.toLowerCase().includes(query) ||
          r.game.away_team.name.toLowerCase().includes(query) ||
          r.game.away_team.abbreviation.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [board, statusFilter, teamSearch]);

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
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">Week {week}</h1>
          <p className="mt-1 text-sm text-white/60">Matchups with context that matters most</p>
        </div>
        {season !== null && <span className="text-sm font-semibold text-white/40">{season} Season</span>}
      </div>
      
      {/* Updated badge + Refresh */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-2 w-2 items-center">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            </span>
          </div>
          <p className="text-xs text-white/50">Updated {formatRelativeTime(lastUpdated)}</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-emerald-400/40 hover:bg-white/10 hover:text-emerald-400 disabled:opacity-50"
        >
          {refreshing ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
              Refreshing…
            </>
          ) : (
            <>
              <span>↻</span>
              Refresh Scores
            </>
          )}
        </button>
      </div>

      {/* Week Navigation */}
      <div className="mb-6 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#12141a] p-1 sm:hidden">
        <button
          type="button"
          onClick={() => setWeek(Math.max(1, (week ?? 1) - 1))}
          disabled={week === 1}
          aria-label="Previous week"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ‹
        </button>
        <Select
          value={week ?? ""}
          onChange={(e) => setWeek(Number(e.target.value))}
          aria-label="Select week"
          wrapperClassName="min-w-0 flex-1"
          className="border-transparent bg-transparent text-center hover:border-transparent"
        >
          {Array.from({ length: 22 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setWeek(Math.min(22, (week ?? 1) + 1))}
          disabled={week === 22}
          aria-label="Next week"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="mb-6 hidden w-full items-center gap-2 rounded-xl border border-white/10 bg-[#12141a] p-1 sm:flex">
        <button
          type="button"
          onClick={() => setWeek(Math.max(1, (week ?? 1) - 1))}
          disabled={week === 1}
          aria-label="Previous week"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ‹
        </button>
        {[(week ?? 1) - 1, week ?? 1, (week ?? 1) + 1]
          .filter((w) => w >= 1 && w <= 22)
          .map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeek(w)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                w === week
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              Week {w}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setWeek(Math.min(22, (week ?? 1) + 1))}
          disabled={week === 22}
          aria-label="Next week"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {/* Status & Search Bar */}
      <div className="mb-6 flex flex-col items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#12141a] p-3 sm:flex-row">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              api.trackEvent("status_filter_change", { filter: "all" });
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === "all"
                ? "bg-white/15 text-white"
                : "bg-transparent text-white/40 hover:text-white/70"
            }`}
          >
            All <span className="text-white/30 ml-1">{board.length}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("scheduled");
              api.trackEvent("status_filter_change", { filter: "scheduled" });
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === "scheduled"
                ? "bg-white/15 text-white"
                : "bg-transparent text-white/40 hover:text-white/70"
            }`}
          >
            Upcoming <span className="text-white/30 ml-1">{scheduledCount}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("final");
              api.trackEvent("status_filter_change", { filter: "final" });
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === "final"
                ? "bg-white/15 text-white"
                : "bg-transparent text-white/40 hover:text-white/70"
            }`}
          >
            Final <span className="text-white/30 ml-1">{finalCount}</span>
          </button>
        </div>

        {/* Team Search */}
        <input
          type="text"
          placeholder="Search teams…"
          value={teamSearch}
          onChange={(e) => setTeamSearch(e.target.value)}
          className="h-8 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/40 transition focus:border-emerald-400/40 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-400/20 sm:max-w-xs"
        />
      </div>

      {/* Games Grid */}
      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: GAMES_LIMIT }).map((_, i) => (
            <MatchRowSkeleton key={i} />
          ))}
        </div>
      )}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {!loading && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-white/60">
              Showing <span className="font-semibold text-white">{visibleRows.length}</span> games
              {teamSearch.trim() && ` (filtered by "${teamSearch}")`}
            </p>
            {visibleRows.length > GAMES_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllGames((v) => !v)}
                className="text-xs font-semibold text-emerald-400 hover:underline"
              >
                {showAllGames ? "Show less" : "Show all"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(showAllGames ? visibleRows : visibleRows.slice(0, GAMES_LIMIT)).map((row, i) => (
              <div
                key={row.game.id}
                className="animate-[fadeInUp_0.35s_ease-out_backwards]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <MatchRow row={row} />
              </div>
            ))}
            {visibleRows.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center">
                <p className="text-sm text-white/60">No games match your filters</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Trending Section */}
      {trends.length > 0 && (
        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-lg font-bold text-white">🔥 Trending Today</h2>
              <p className="mt-1 text-xs text-white/50">High-hit-rate props across all games</p>
            </div>
            <Link to="/trends" className="text-xs font-semibold text-emerald-400 hover:underline">
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

      {/* Cheatsheet Groups */}
      {trendGroups && (
        <div className="mt-12">
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

      {/* Advanced Tools */}
      {trendGroups && (trendGroups.injury_impact.length > 0 || trendGroups.opponent_rank.length > 0) && (
        <div className="mt-12">
          <AdvancedToolsWidget injuryRows={trendGroups.injury_impact} opponentRankRows={trendGroups.opponent_rank} />
        </div>
      )}

      {/* Parlays Widget */}
      {firstBoardGame && parlays.length > 0 && (
        <div className="mt-12">
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



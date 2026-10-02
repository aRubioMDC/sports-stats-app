import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, useBoard, useCheatsheet, useConfig, useParlays, useTeams, useTrendGroups } from "../api";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";
import { MatchRow } from "../components/MatchRow";
import { CheatsheetGroups } from "../components/CheatsheetGroups";
import { AdvancedToolsWidget } from "../components/AdvancedToolsWidget";
import { ParlaysWidget } from "../components/ParlaysWidget";
import { Select } from "../components/Select";
import { periodLabel, periodLabelShort } from "../lib/period";

type StatusFilter = "all" | "final" | "scheduled";

const GAMES_LIMIT = 6;
const NFL_WEEK_COUNT = 22; // wildcard through Super Bowl

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

export function Home() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("scheduled");
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [showAllGames, setShowAllGames] = useState(false);
  const [teamSearch, setTeamSearch] = useState<string>("");

  // React Query hooks for automatic caching across navigation
  const configQuery = useConfig();
  const teamsQuery = useTeams();
  
  // Use selectedWeek if set, otherwise use current week from config
  const season = configQuery.data?.current_season ?? null;
  const week =
    selectedWeek ??
    configQuery.data?.recommended_period ??
    configQuery.data?.current_week ??
    null;
  // Sports with no real "week" (NHL) navigate by single calendar day instead —
  // a 22-option week dropdown doesn't apply, and the max bound is generous
  // enough to cover a full day-granular season (~280 real days Sept-June).
  const isDayBased = configQuery.data?.period_unit === "day";
  const minPeriod = configQuery.data?.period_min ?? (isDayBased ? 0 : 1);
  const maxPeriod = configQuery.data?.period_max ?? (isDayBased ? 400 : NFL_WEEK_COUNT);

  useEffect(() => {
    if (isDayBased) {
      setStatusFilter("all");
    }
  }, [isDayBased]);

  // Priority 1: Load board first (games grid - what user sees)
  const boardQuery = useBoard(season, week);
  
  // Priority 2: Load cheatsheet after board is ready (Trending Today)
  // Lower thresholds to get more results from available signals
  const cheatsheetQuery = useCheatsheet(
    0.5,
    0,
    season ?? undefined,
    week ?? undefined,
    undefined,
    boardQuery.isSuccess // Enable only after board loads
  );
  
  // Priority 3: Load trend groups after cheatsheet is ready (Advanced Tools - background)
  const trendGroupsQuery = useTrendGroups(
    season ?? undefined,
    week ?? undefined,
    undefined,
    cheatsheetQuery.isSuccess // Enable only after cheatsheet loads
  );
  
  // Priority 2.5: Load parlays after board loads (mid-priority background data)
  const parlaysQuery = useParlays(
    selectedGameId,
    boardQuery.isSuccess // Enable after board loads
  );

  // Derive state from queries early (needed for useMemo dependencies)
  const board = boardQuery.data ?? [];
  const trendGroups = trendGroupsQuery.data ?? null;
  const parlays = parlaysQuery.data ?? [];

  // Sort trends by upcoming game time and hit rate
  const sortedTrends = useMemo(() => {
    const allTrends = cheatsheetQuery.data ?? [];
    const now = new Date().getTime();
    
    return allTrends
      .map(trend => ({
        ...trend,
        gameTime: trend.game_kickoff ? new Date(trend.game_kickoff).getTime() : Infinity,
      }))
      .filter(trend => trend.gameTime > now) // Only upcoming games
      .sort((a, b) => {
        // Sort by: game time (ascending), then by hit_rate (descending)
        if (a.gameTime !== b.gameTime) return a.gameTime - b.gameTime;
        return b.hit_rate - a.hit_rate;
      })
      .map(({ gameTime, ...trend }) => trend);
  }, [cheatsheetQuery.data]);

  // Sort opponent rank rows by upcoming game time and hit rate
  const sortedInjuryRows = useMemo(() => {
    const rows = trendGroups?.injury_impact ?? [];
    const now = new Date().getTime();

    return rows
      .map(row => ({
        ...row,
        gameTime: row.game_kickoff ? new Date(row.game_kickoff).getTime() : Infinity,
      }))
      .filter(row => row.gameTime > now) // Only upcoming games
      .sort((a, b) => {
        if (a.gameTime !== b.gameTime) return a.gameTime - b.gameTime;
        return b.hit_rate - a.hit_rate;
      })
      .map(({ gameTime, ...row }) => row);
  }, [trendGroups?.injury_impact]);

  // Sort opponent rank rows by upcoming game time and hit rate
  const sortedOpponentRows = useMemo(() => {
    const rows = trendGroups?.opponent_rank ?? [];
    const now = new Date().getTime();
    
    return rows
      .map(row => ({
        ...row,
        gameTime: row.game_kickoff ? new Date(row.game_kickoff).getTime() : Infinity,
      }))
      .filter(row => row.gameTime > now) // Only upcoming games
      .sort((a, b) => {
        // Sort by: game time (ascending), then by hit_rate (descending)
        if (a.gameTime !== b.gameTime) return a.gameTime - b.gameTime;
        return b.hit_rate - a.hit_rate;
      })
      .map(({ gameTime, ...row }) => row);
  }, [trendGroups?.opponent_rank]);

  // Build team logos mapping
  const teamLogos = useMemo(() => {
    if (!teamsQuery.data) return {};
    const mapping: Record<string, { logoUrl: string; primaryColor: string }> = {};
    teamsQuery.data.forEach((team) => {
      mapping[team.abbreviation] = { logoUrl: team.logo_url, primaryColor: team.primary_color };
      mapping[team.name] = { logoUrl: team.logo_url, primaryColor: team.primary_color };
    });
    return mapping;
  }, [teamsQuery.data]);

  // Auto-select first game when board loads
  useEffect(() => {
    if (board.length > 0 && !selectedGameId) {
      const firstUpcoming = board.find((r) => r.game.status !== "final") ?? board[0];
      if (firstUpcoming) {
        setSelectedGameId(firstUpcoming.game.id);
      }
    }
  }, [board, selectedGameId]);

  // Track page view
  useEffect(() => {
    api.trackEvent("page_view_home");
  }, []);

  // Derive remaining state from queries — cap to one prop per player, and
  // prefer spreading across different teams, so "Trending Today" isn't just
  // one game's players filling every slot.
  const trends = useMemo(() => {
    const seenPlayers = new Set<string>();
    const seenTeams = new Set<string>();
    const diversified: typeof sortedTrends = [];
    const leftover: typeof sortedTrends = [];
    for (const trend of sortedTrends) {
      if (seenPlayers.has(trend.player_name)) continue;
      if (seenTeams.has(trend.team)) {
        leftover.push(trend);
        continue;
      }
      seenPlayers.add(trend.player_name);
      seenTeams.add(trend.team);
      diversified.push(trend);
      if (diversified.length === 3) break;
    }
    // Not enough distinct teams to fill all 3 slots — backfill from leftovers
    // rather than showing fewer trending cards than we have data for.
    for (const trend of leftover) {
      if (diversified.length === 3) break;
      if (seenPlayers.has(trend.player_name)) continue;
      seenPlayers.add(trend.player_name);
      diversified.push(trend);
    }
    return diversified;
  }, [sortedTrends]);
  const error = configQuery.error || boardQuery.error ? "Could not load data" : null;
  const loading = configQuery.isLoading || boardQuery.isLoading;

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
  };

  useEffect(() => {
    if (season === null || week === null) return;

    const stream = api.openScoresStream();

    const onScoresRefresh = () => {
      // Refresh only score-sensitive queries; trends/parlays keep their own cadence.
      queryClient.invalidateQueries({ queryKey: ["board", season, week] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["games", season, week] });
    };

    stream.addEventListener("scores_refresh", onScoresRefresh);
    stream.onerror = () => {
      // EventSource auto-reconnects; no manual retry loop needed here.
    };

    return () => {
      stream.removeEventListener("scores_refresh", onScoresRefresh);
      stream.close();
    };
  }, [queryClient, season, week]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">{periodLabel(configQuery.data, week)}</h1>
          <p className="mt-1 text-sm text-white/60">Matchups with context that matters most</p>
        </div>
      </div>

      {/* Week/Date Navigation */}
      <div className="mb-4 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#12141a] p-1 sm:hidden">
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.max(minPeriod, (week ?? minPeriod) - 1))}
          disabled={week === minPeriod}
          aria-label="Previous period"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ‹
        </button>
        {isDayBased ? (
          <span className="flex-1 text-center text-sm font-semibold text-white/80">
            {periodLabel(configQuery.data, week)}
          </span>
        ) : (
          <Select
            value={week ?? ""}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            aria-label="Select week"
            wrapperClassName="min-w-0 flex-1"
            className="border-transparent bg-transparent text-center hover:border-transparent"
          >
            {Array.from({ length: Math.max(1, maxPeriod - minPeriod + 1) }, (_, i) => minPeriod + i).map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </Select>
        )}
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.min(maxPeriod, (week ?? minPeriod) + 1))}
          disabled={week === maxPeriod}
          aria-label="Next period"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="mb-4 hidden w-full items-center gap-2 rounded-xl border border-white/10 bg-[#12141a] p-1 sm:flex">
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.max(minPeriod, (week ?? minPeriod) - 1))}
          disabled={week === minPeriod}
          aria-label="Previous period"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          ‹
        </button>
        {[(week ?? minPeriod) - 1, week ?? minPeriod, (week ?? minPeriod) + 1]
          .filter((w) => w >= minPeriod && w <= maxPeriod)
          .map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setSelectedWeek(w)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                w === week
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              {isDayBased ? periodLabelShort(configQuery.data, w) : `Week ${w}`}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.min(maxPeriod, (week ?? minPeriod) + 1))}
          disabled={week === maxPeriod}
          aria-label="Next period"
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">🔥</span> 
                Trending Today
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Top props with strong recent performance • Backed by statistical analysis
              </p>
            </div>
            <Link to="/trends" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition hover:underline">
              View all {trends.length > 3 ? `(${trends.length})` : ''} →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {trends.slice(0, 3).map((row, i) => (
              <CheatsheetRowCard key={`${row.player_name}-${row.stat_name}-${i}`} row={row} teamLogos={teamLogos} />
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
            teamLogos={teamLogos}
          />
        </div>
      )}

      {/* Advanced Tools */}
      {trendGroups && (
        <div className="mt-12">
          <AdvancedToolsWidget injuryRows={sortedInjuryRows} opponentRankRows={sortedOpponentRows} teamLogos={teamLogos} />
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



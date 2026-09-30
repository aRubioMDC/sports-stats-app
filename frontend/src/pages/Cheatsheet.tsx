import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, useConfig, useTeams, useTrendGroups } from "../api";
import type { CheatsheetRow } from "../api";
import { CheatsheetRowCard } from "../components/CheatsheetRowCard";
import { STAT_LABELS } from "../lib/statLabels";

// Real TrendGroups categories computed server-side in get_trend_groups()
// (backend/app/routers/trends.py) — "all" is a client-side dedup across them,
// since the buckets are not mutually exclusive (a row can be both
// recent_form and versus_opponent, for example).
type CategoryKey =
  | "all"
  | "recent_form"
  | "versus_opponent"
  | "home_away_splits"
  | "opponent_rank"
  | "injury_impact"
  | "alternate_lines"
  | "unders_only"
  | "team_form";

const CATEGORIES: Array<{ key: CategoryKey; label: string; icon: string; description: string }> = [
  { key: "all", label: "All", icon: "📋", description: "Every real signal that qualifies, deduplicated across categories." },
  { key: "recent_form", label: "Recent Form", icon: "⚡", description: "Hit rate ≥75% over recent games." },
  { key: "versus_opponent", label: "Versus Opponent", icon: "🛡️", description: "Real head-to-head history vs. the upcoming opponent confirms the pick." },
  { key: "home_away_splits", label: "Home/Away Splits", icon: "📍", description: "Real home/away split confirms the pick." },
  { key: "opponent_rank", label: "Opponent Rank", icon: "🏆", description: "Upcoming opponent's real defensive rank is a genuine matchup edge." },
  { key: "injury_impact", label: "Injury Impact", icon: "🩹", description: "Real teammate-absence data confirms the pick." },
  { key: "alternate_lines", label: "Alternate Lines", icon: "↗️", description: "Other qualifying over/under signals." },
  { key: "unders_only", label: "Unders Only", icon: "🔻", description: "Under-specific signals." },
  { key: "team_form", label: "Team Form", icon: "👥", description: "Additional qualifying signals." },
];

type SortKey = "hit_rate" | "games" | "edge" | "kelly";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "hit_rate", label: "Hit Rate" },
  { key: "games", label: "Sample Size" },
  { key: "edge", label: "Market Edge" },
  { key: "kelly", label: "Kelly Fraction" },
];

function sortValue(row: CheatsheetRow, key: SortKey): number {
  switch (key) {
    case "hit_rate":
      return row.hit_rate;
    case "games":
      return row.games;
    case "edge":
      return row.edge ?? -Infinity;
    case "kelly":
      return row.kelly_fraction ?? -Infinity;
  }
}

function sortRows(rows: CheatsheetRow[], key: SortKey): CheatsheetRow[] {
  return [...rows].sort((a, b) => sortValue(b, key) - sortValue(a, key));
}

// A range input's fill must be relative to its own min-max span, not the raw
// value — a slider with min=60 sitting at value=60 is at the LEFT edge (0%
// of the track), not 60% of it.
function sliderFillPct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.round(((value - min) / (max - min)) * 100);
}

// Stable identity for a signal so the same real pick isn't double-counted
// across TrendGroups categories (buckets are not mutually exclusive).
function rowKey(row: CheatsheetRow): string {
  return `${row.player_name}|${row.stat_name}|${row.threshold}|${row.direction}|${row.game_id ?? "none"}`;
}

const ALL_STAT_OPTION = "all";
const ALL_TEAM_OPTION = "all";
// The backend baseline for every TrendGroups category is 60% hit rate (see
// min_hit_rate=0.6 in get_trend_groups) — the slider narrows further from
// there, it never reveals rows the API withheld below that floor.
const MIN_HIT_RATE_FLOOR = 0.6;

export function Cheatsheet() {
  const [category, setCategory] = useState<CategoryKey>("all");
  const [search, setSearch] = useState("");
  const [statFilter, setStatFilter] = useState(ALL_STAT_OPTION);
  const [teamFilter, setTeamFilter] = useState(ALL_TEAM_OPTION);
  const [sortKey, setSortKey] = useState<SortKey>("hit_rate");
  const [minHitRate, setMinHitRate] = useState(MIN_HIT_RATE_FLOOR);
  const [onlyMarketEdge, setOnlyMarketEdge] = useState(false);

  const configQuery = useConfig();
  // No daysBack — that restricts to games played in the last N literal days,
  // which is empty most of the week and would make this page look broken.
  const trendGroupsQuery = useTrendGroups(configQuery.data?.current_season, configQuery.data?.current_week);
  const teamsQuery = useTeams();

  const trendGroups = trendGroupsQuery.data ?? null;
  const loading = trendGroupsQuery.isLoading || teamsQuery.isLoading;

  const teamLogos = useMemo(() => {
    if (!teamsQuery.data) return {};
    return teamsQuery.data.reduce(
      (acc, team) => {
        acc[team.abbreviation] = { logoUrl: team.logo_url, primaryColor: team.primary_color };
        return acc;
      },
      {} as Record<string, { logoUrl: string; primaryColor: string }>
    );
  }, [teamsQuery.data]);

  useEffect(() => {
    api.trackEvent("page_view_cheatsheet");
  }, []);

  // Real category buckets straight from TrendGroups, plus a deduplicated "all".
  const categoryRows = useMemo<Record<CategoryKey, CheatsheetRow[]> | null>(() => {
    if (!trendGroups) return null;
    const groups: Record<Exclude<CategoryKey, "all">, CheatsheetRow[]> = {
      recent_form: trendGroups.recent_form ?? [],
      versus_opponent: trendGroups.versus_opponent ?? [],
      home_away_splits: trendGroups.home_away_splits ?? [],
      opponent_rank: trendGroups.opponent_rank ?? [],
      injury_impact: trendGroups.injury_impact ?? [],
      alternate_lines: trendGroups.alternate_lines ?? [],
      unders_only: trendGroups.unders_only ?? [],
      team_form: trendGroups.team_form ?? [],
    };
    const deduped = new Map<string, CheatsheetRow>();
    for (const key of Object.keys(groups) as Array<keyof typeof groups>) {
      for (const row of groups[key]) deduped.set(rowKey(row), row);
    }
    return { all: Array.from(deduped.values()), ...groups };
  }, [trendGroups]);

  const statOptions = useMemo(() => {
    if (!categoryRows) return [];
    const set = new Set<string>();
    for (const row of categoryRows.all) set.add(row.stat_name);
    return Array.from(set).sort();
  }, [categoryRows]);

  const teamOptions = useMemo(() => {
    if (!categoryRows) return [];
    const set = new Set<string>();
    for (const row of categoryRows.all) if (row.team) set.add(row.team);
    return Array.from(set).sort();
  }, [categoryRows]);

  const visibleRows = useMemo(() => {
    if (!categoryRows) return [];
    let rows = categoryRows[category];
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      rows = rows.filter((r) => r.player_name.toLowerCase().includes(query));
    }
    if (statFilter !== ALL_STAT_OPTION) rows = rows.filter((r) => r.stat_name === statFilter);
    if (teamFilter !== ALL_TEAM_OPTION) rows = rows.filter((r) => r.team === teamFilter);
    rows = rows.filter((r) => r.hit_rate >= minHitRate);
    if (onlyMarketEdge) rows = rows.filter((r) => r.edge != null && r.edge > 0);
    return sortRows(rows, sortKey);
  }, [categoryRows, category, search, statFilter, teamFilter, minHitRate, onlyMarketEdge, sortKey]);

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-white/60">Loading cheatsheet…</div>;
  }

  if (!trendGroups || !categoryRows) {
    return <div className="mx-auto max-w-6xl px-4 py-8 text-red-400">Unable to load cheatsheet data.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/" className="text-sm text-sky-400 hover:underline">
        ← Back to schedule
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="mb-1 text-4xl font-black tracking-tight text-white">Hit-Rate Cheatsheet</h1>
        <p className="text-sm text-white/50">Every real signal the backend computes — browse, search, and filter to find genuine edges.</p>
      </div>

      {/* Category Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#111620] p-1">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setCategory(item.key)}
            title={item.description}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              category === item.key ? "bg-white text-[#050914] shadow-sm" : "text-white/60 hover:text-white"
            }`}
          >
            {item.icon} {item.label}
            {categoryRows[item.key].length > 0 && (
              <span className="ml-2 text-xs text-white/50">({categoryRows[item.key].length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-[#111620] p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold text-white/70">
            Search Player
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Mahomes"
              className="mt-1 block w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </label>

          <label className="text-sm font-semibold text-white/70">
            Stat Type
            <select
              value={statFilter}
              onChange={(e) => setStatFilter(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-white"
            >
              <option value={ALL_STAT_OPTION}>All Stats</option>
              {statOptions.map((stat) => (
                <option key={stat} value={stat}>
                  {STAT_LABELS[stat] ?? stat}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-white/70">
            Team
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-white"
            >
              <option value={ALL_TEAM_OPTION}>All Teams</option>
              {teamOptions.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-white/70">
            Sort By
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-white"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-semibold text-white/70">Minimum Hit Rate</label>
            <span className="text-2xl font-black text-emerald-400">{Math.round(minHitRate * 100)}%</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/50">{Math.round(MIN_HIT_RATE_FLOOR * 100)}%</span>
            <div className="flex-1">
              <input
                type="range"
                min={Math.round(MIN_HIT_RATE_FLOOR * 100)}
                max="100"
                step="1"
                value={Math.round(minHitRate * 100)}
                onChange={(e) => setMinHitRate(parseInt(e.target.value) / 100)}
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${sliderFillPct(minHitRate * 100, MIN_HIT_RATE_FLOOR * 100, 100)}%, #1f2937 ${sliderFillPct(minHitRate * 100, MIN_HIT_RATE_FLOOR * 100, 100)}%, #1f2937 100%)`,
                }}
                className="w-full cursor-pointer"
              />
            </div>
            <span className="text-xs text-white/50">100%</span>
          </div>
          <p className="mt-2 text-xs text-white/40">
            The API only returns signals with a real hit rate ≥{Math.round(MIN_HIT_RATE_FLOOR * 100)}% for this
            page — this slider narrows further, it can't reveal weaker signals below that floor.
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-white/70">
          <input
            type="checkbox"
            checked={onlyMarketEdge}
            onChange={(e) => setOnlyMarketEdge(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-[#0b0d12] accent-emerald-500"
          />
          Only show real market-edge picks
          <span className="font-normal text-white/40">(a real matched sportsbook line where our recomputed hit rate beats the de-vigged price)</span>
        </label>

        <div className="mt-4 rounded-lg bg-white/5 px-3 py-2">
          <p className="text-xs text-white/60">
            Showing <span className="font-bold text-emerald-400">{visibleRows.length}</span> real signal
            {visibleRows.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Results Grid */}
      {visibleRows.length === 0 && categoryRows.all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#111620] p-8 text-center text-white/40">
          No real signals returned by the API yet — check back once more games from this week have been played.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#111620] p-8 text-center text-white/40">
          No props match your filters. Try a different category, a lower minimum hit rate, "All Stats"/"All Teams",
          clearing the search, or turning off the market-edge filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((row) => (
            <CheatsheetRowCard key={rowKey(row)} row={row} teamLogos={teamLogos} />
          ))}
        </div>
      )}
    </div>
  );
}

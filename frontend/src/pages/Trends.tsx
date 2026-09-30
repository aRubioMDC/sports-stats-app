import { useEffect, useMemo, useState } from "react";
import { api, useConfig, useTeams, useTrendGroups } from "../api";
import type { CheatsheetRow } from "../api";
import { formatTrendLine, ordinal, STAT_LABELS } from "../lib/statLabels";
import { useBankroll } from "../lib/bankroll";

// These map 1:1 onto the real TrendGroups categories the backend computes in
// get_trend_groups() (backend/app/routers/trends.py) — no client-side
// re-derivation of "which signal counts", just real server-computed buckets.
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
  { key: "all", label: "All", icon: "📋", description: "Every real signal that qualifies today, deduplicated across categories." },
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

/** Stable identity for a signal so the same real pick isn't double-counted when it
 * appears in more than one TrendGroups category (the backend buckets are not
 * mutually exclusive for alternate_lines/unders_only/team_form). */
function rowKey(row: CheatsheetRow): string {
  return `${row.player_name}|${row.stat_name}|${row.threshold}|${row.direction}|${row.game_id ?? "none"}`;
}

function isOpponentRankEdge(row: CheatsheetRow): boolean {
  if (row.opponent_rank == null || !row.opponent_team_count) return false;
  const midpoint = row.opponent_team_count / 2;
  return row.direction === "under" ? row.opponent_rank <= midpoint : row.opponent_rank > midpoint;
}

function confirmingSignalCount(row: CheatsheetRow): number {
  let count = 0;
  if (row.split_games && row.split_hits != null && row.split_hits / row.split_games >= 0.5) count++;
  if (row.h2h_games && row.h2h_hits != null && row.h2h_hits / row.h2h_games >= 0.5) count++;
  if (row.without_player_games && row.without_player_hits != null && row.without_player_hits / row.without_player_games >= 0.5) count++;
  if (isOpponentRankEdge(row)) count++;
  if (row.edge != null && row.edge > 0) count++;
  return count;
}

interface Confidence {
  level: "high" | "medium" | "low";
  label: string;
  ciWidthPct: number | null;
  signalCount: number;
}

/**
 * Confidence blends sample precision (Wilson 95% CI width) with how many
 * independent real signals (split/H2H/injury/opponent-rank/market edge)
 * corroborate the pick. A high point-estimate hit rate on a tiny sample with
 * a wide CI and no corroborating signal is genuinely less trustworthy than
 * one backed by a tight CI or multiple confirming signals — never just the
 * raw hit-rate/games thresholds used before.
 */
function getConfidence(row: CheatsheetRow): Confidence {
  const ciWidth =
    row.hit_rate_ci_low != null && row.hit_rate_ci_high != null ? row.hit_rate_ci_high - row.hit_rate_ci_low : null;
  const signalCount = confirmingSignalCount(row);

  let level: Confidence["level"] = "low";
  if ((ciWidth != null && ciWidth <= 0.25 && row.games >= 8) || (signalCount >= 2 && row.hit_rate >= 0.65)) {
    level = "high";
  } else if ((ciWidth != null && ciWidth <= 0.45 && row.games >= 5) || signalCount >= 1) {
    level = "medium";
  }

  return {
    level,
    label: level === "high" ? "High Confidence" : level === "medium" ? "Medium Confidence" : "Low Confidence",
    ciWidthPct: ciWidth != null ? Math.round(ciWidth * 100) : null,
    signalCount,
  };
}

function getMatchupLabel(row: CheatsheetRow): string | null {
  if (!row.opponent_team) return null;
  return `${row.is_home ? "vs" : "@"} ${row.opponent_team}`;
}

function getKickoffLabel(row: CheatsheetRow): string | null {
  if (!row.game_kickoff) return null;
  const d = new Date(row.game_kickoff);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const ALL_STAT_OPTION = "all";
const ALL_TEAM_OPTION = "all";
// The backend baseline for every TrendGroups category is 60% hit rate (see
// min_hit_rate=0.6 in get_trend_groups) — the slider narrows further from
// there, it never reveals rows the API withheld below that floor.
const MIN_HIT_RATE_FLOOR = 0.6;

export function Trends() {
  const [category, setCategory] = useState<CategoryKey>("all");
  const [statFilter, setStatFilter] = useState(ALL_STAT_OPTION);
  const [teamFilter, setTeamFilter] = useState(ALL_TEAM_OPTION);
  const [sortKey, setSortKey] = useState<SortKey>("hit_rate");
  const [minHitRate, setMinHitRate] = useState(MIN_HIT_RATE_FLOOR);
  const [selectedRow, setSelectedRow] = useState<CheatsheetRow | null>(null);

  // React Query hooks for automatic caching
  const configQuery = useConfig();
  // No daysBack filter — that restricts to games played in the last N literal
  // days, which is empty most of the week (games cluster on a few days) and
  // would otherwise make this page look broken with no real trends to show.
  const trendGroupsQuery = useTrendGroups(configQuery.data?.current_season, configQuery.data?.current_week);
  const teamsQuery = useTeams();

  const trendGroups = trendGroupsQuery.data ?? null;
  const loading = trendGroupsQuery.isLoading || teamsQuery.isLoading;

  // Build team logos mapping
  const teamLogos = useMemo(() => {
    if (!teamsQuery.data) return {};
    return teamsQuery.data.reduce(
      (acc, team) => {
        acc[team.abbreviation] = {
          logoUrl: team.logo_url,
          primaryColor: team.primary_color,
        };
        return acc;
      },
      {} as Record<string, { logoUrl: string; primaryColor: string }>
    );
  }, [teamsQuery.data]);

  // Track page view
  useEffect(() => {
    api.trackEvent("page_view_trends");
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
    if (statFilter !== ALL_STAT_OPTION) rows = rows.filter((r) => r.stat_name === statFilter);
    if (teamFilter !== ALL_TEAM_OPTION) rows = rows.filter((r) => r.team === teamFilter);
    rows = rows.filter((r) => r.hit_rate >= minHitRate);
    return sortRows(rows, sortKey);
  }, [categoryRows, category, statFilter, teamFilter, minHitRate, sortKey]);

  if (loading) {
    return <div className="mx-auto max-w-7xl px-4 py-8 text-white/60">Loading trends…</div>;
  }

  if (!trendGroups || !categoryRows) {
    return <div className="mx-auto max-w-7xl px-4 py-8 text-red-400">Unable to load trend data.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="mb-4 text-4xl font-black tracking-tight text-white">Trends Today</h1>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#111620] p-1">
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
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#111620] p-6">
          <div className="grid gap-4 sm:grid-cols-3">
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
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${Math.round(minHitRate * 100)}%, #1f2937 ${Math.round(minHitRate * 100)}%, #1f2937 100%)`,
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

          <div className="mt-4 rounded-lg bg-white/5 px-3 py-2">
            <p className="text-xs text-white/60">
              Showing <span className="font-bold text-emerald-400">{visibleRows.length}</span> real trend
              {visibleRows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Trends Grid */}
        {visibleRows.length === 0 && categoryRows.all.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#111620] p-8 text-center text-white/40">
            No real trend signals in the last 3 days yet — check back once more games from this week have been
            played.
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#111620] p-8 text-center text-white/40">
            No trends match your filters. Try a different category, a lower minimum hit rate, or "All Stats"/"All
            Teams".
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleRows.map((row) => (
              <TrendRowCard key={rowKey(row)} row={row} onSelect={() => setSelectedRow(row)} teamLogos={teamLogos} />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <TrendDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} teamLogos={teamLogos} />
      )}
    </div>
  );
}

interface TrendRowCardProps {
  row: CheatsheetRow;
  onSelect: () => void;
  teamLogos: Record<string, { logoUrl: string; primaryColor: string }>;
}

function TrendRowCard({ row, onSelect, teamLogos }: TrendRowCardProps) {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const { bankroll } = useBankroll();

  const confidenceColors = {
    high: "bg-emerald-500/20 border-emerald-500/50 text-emerald-200",
    medium: "bg-amber-500/20 border-amber-500/50 text-amber-200",
    low: "bg-rose-500/20 border-rose-500/50 text-rose-200",
  };

  const confidence = getConfidence(row);
  const matchup = getMatchupLabel(row);
  const kickoff = getKickoffLabel(row);
  const teamLogo = teamLogos[row.team];

  const showCI = row.games < 8 && row.hit_rate_ci_low != null && row.hit_rate_ci_high != null;
  const splitPct = row.split_games ? Math.round(((row.split_hits ?? 0) / row.split_games) * 100) : null;
  const h2hPct = row.h2h_games ? Math.round(((row.h2h_hits ?? 0) / row.h2h_games) * 100) : null;
  const injuryPct = row.without_player_games
    ? Math.round(((row.without_player_hits ?? 0) / row.without_player_games) * 100)
    : null;
  const opponentEdge = isOpponentRankEdge(row);
  const hasContextSignal = (splitPct != null && splitPct >= 50) || (h2hPct != null && h2hPct >= 50) || (injuryPct != null && injuryPct >= 50) || opponentEdge;

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-2xl border border-white/10 bg-[#111620] p-4 transition hover:border-white/20 hover:bg-white/5"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {teamLogo?.logoUrl ? (
            <img src={teamLogo.logoUrl} alt={row.team} className="h-8 w-8 shrink-0 object-contain" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{row.player_name}</span>
              <span className="text-xs text-white/50 font-semibold">{row.team}</span>
            </div>
            {kickoff && <div className="text-xs text-white/40">{kickoff}</div>}
          </div>
        </div>
        <div className="text-right text-xs font-semibold text-white/70">{matchup ?? "No upcoming game"}</div>
      </div>

      {/* Stat Label */}
      <div className="mb-3 rounded-lg bg-white/5 px-3 py-2">
        <div className="text-sm font-semibold text-white">{formatTrendLine(row.stat_name, row.threshold, row.direction)}</div>
      </div>

      {/* Hit Rate and Confidence */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-black text-emerald-400">{Math.round(row.hit_rate * 100)}%</div>
          <div className="text-xs text-white/50">
            {row.hits}/{row.games} games
            {showCI && (
              <span className="ml-1 text-white/35">
                (95% CI {Math.round((row.hit_rate_ci_low ?? 0) * 100)}–{Math.round((row.hit_rate_ci_high ?? 0) * 100)}%)
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowConfidenceInfo(!showConfidenceInfo);
            }}
            className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${confidenceColors[confidence.level]}`}
          >
            {confidence.label}
          </button>
          {showConfidenceInfo && (
            <div className="absolute right-0 top-full mt-2 z-10 w-64 rounded-lg border border-white/20 bg-[#0f1117] p-3 text-xs text-white/80 shadow-lg">
              <div className="mb-2 font-semibold text-white">Why this confidence?</div>
              <div className="space-y-1">
                <div>
                  {confidence.ciWidthPct != null
                    ? `95% confidence interval spans ${confidence.ciWidthPct} points.`
                    : "Confidence interval unavailable."}
                </div>
                <div>
                  {confidence.signalCount} confirming real signal{confidence.signalCount === 1 ? "" : "s"} (split /
                  H2H / injury / opponent rank / market edge).
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Real contextual signals */}
      <div className="space-y-1.5 border-t border-white/10 pt-3 text-xs">
        {splitPct != null && splitPct >= 50 && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">📍 {row.is_home ? "Home" : "Away"} Split</span>
            <span className="font-semibold text-white">
              {splitPct}% ({row.split_hits}/{row.split_games})
            </span>
          </div>
        )}
        {h2hPct != null && h2hPct >= 50 && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">🎯 vs {row.opponent_team ?? "Opponent"}</span>
            <span className="font-semibold text-white">
              {h2hPct}% ({row.h2h_hits}/{row.h2h_games})
            </span>
          </div>
        )}
        {injuryPct != null && injuryPct >= 50 && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">🩹 Without {row.without_player}</span>
            <span className="font-semibold text-white">
              {injuryPct}% ({row.without_player_hits}/{row.without_player_games})
            </span>
          </div>
        )}
        {opponentEdge && row.opponent_rank != null && row.opponent_team_count && (
          <div className="flex items-center justify-between">
            <span className="text-white/60">🏆 {row.opponent_team} Matchup Rank</span>
            <span className="font-semibold text-white">
              {ordinal(row.opponent_rank)} of {row.opponent_team_count}
            </span>
          </div>
        )}
        {!hasContextSignal && <div className="text-white/30">No confirming contextual signals yet.</div>}
      </div>

      {/* Real market comparison — only when a real matching sportsbook quote exists */}
      {row.market_line != null && row.edge != null && row.market_hits != null && row.market_games != null && (
        <div className="mt-3 border-t border-white/10 pt-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-white/50">
              Book: {row.direction === "over" ? "Over" : "Under"} {row.market_line} ({row.market_price! > 0 ? "+" : ""}
              {row.market_price}) — hit {row.market_hits}/{row.market_games}
            </span>
            <span className={`shrink-0 font-bold ${row.edge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {row.edge >= 0 ? "+" : ""}
              {Math.round(row.edge * 100)}% edge
            </span>
          </div>
          {row.kelly_fraction != null && row.kelly_fraction > 0 && (
            <div className="mt-1 text-emerald-400/80">
              Suggested stake: ${(bankroll * row.kelly_fraction).toFixed(2)} ({(row.kelly_fraction * 100).toFixed(1)}%
              bankroll, ¼-Kelly)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TrendDetailModalProps {
  row: CheatsheetRow;
  onClose: () => void;
  teamLogos: Record<string, { logoUrl: string; primaryColor: string }>;
}

function TrendDetailModal({ row, onClose, teamLogos }: TrendDetailModalProps) {
  const { bankroll } = useBankroll();
  const confidence = getConfidence(row);
  const matchup = getMatchupLabel(row);
  const kickoff = getKickoffLabel(row);
  const teamLogo = teamLogos[row.team];

  // Full transparency here (unlike the card badges): show the real split/H2H
  // numbers whenever present, even if they don't confirm the pick — omitting
  // an unfavorable real number would itself be a form of fabrication by omission.
  const hasSplit = row.split_games != null && row.split_games > 0;
  const hasH2h = row.h2h_games != null && row.h2h_games > 0;
  const hasInjury = row.without_player_games != null && row.without_player_games > 0;
  const hasOpponentRank = row.opponent_rank != null && row.opponent_team_count != null;
  const hasMarket = row.market_line != null && row.market_hits != null && row.market_games != null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1117] p-8"
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              {teamLogo?.logoUrl ? (
                <img src={teamLogo.logoUrl} alt={row.team} className="h-12 w-12 shrink-0 object-contain" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-full" style={{ backgroundColor: teamLogo?.primaryColor || "#ffffff" }} />
              )}
              <div>
                <h1 className="text-3xl font-black text-white">{row.player_name}</h1>
                <p className="text-white/60">
                  {row.team} • {matchup ?? "No upcoming game"}
                  {kickoff && ` • ${kickoff}`}
                </p>
              </div>
            </div>
            <div className="mt-2 inline-block rounded-lg bg-white/5 px-3 py-2">
              <p className="text-sm font-semibold text-white">{formatTrendLine(row.stat_name, row.threshold, row.direction)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl text-white/40 hover:text-white">
            ✕
          </button>
        </div>

        {/* Recent Form (always real, always present) */}
        <div className="mb-6 rounded-lg border border-white/10 bg-[#111620] p-4">
          <h3 className="mb-3 text-sm font-semibold text-white/60">Recent Form</h3>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-black text-emerald-400">{Math.round(row.hit_rate * 100)}%</div>
            <p className="text-white/80">
              Hit in {row.hits} of last {row.games} games
              {row.hit_rate_ci_low != null && row.hit_rate_ci_high != null && (
                <span className="ml-1 text-white/40">
                  (95% CI {Math.round(row.hit_rate_ci_low * 100)}–{Math.round(row.hit_rate_ci_high * 100)}%)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Home/Away & Head-to-Head */}
        {(hasSplit || hasH2h) && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {hasSplit && (
              <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                <h3 className="mb-3 text-sm font-semibold text-white/60">{row.is_home ? "Home" : "Away"} Split</h3>
                <div className="text-2xl font-black text-white">
                  {Math.round(((row.split_hits ?? 0) / (row.split_games ?? 1)) * 100)}%
                </div>
                <p className="mt-1 text-sm text-white/70">
                  {row.split_hits} of {row.split_games} {row.is_home ? "home" : "away"} games
                </p>
              </div>
            )}
            {hasH2h && (
              <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                <h3 className="mb-3 text-sm font-semibold text-white/60">vs {row.opponent_team ?? "Opponent"}</h3>
                <div className="text-2xl font-black text-white">
                  {Math.round(((row.h2h_hits ?? 0) / (row.h2h_games ?? 1)) * 100)}%
                </div>
                <p className="mt-1 text-sm text-white/70">
                  {row.h2h_hits} of {row.h2h_games} past matchups
                </p>
              </div>
            )}
          </div>
        )}

        {/* Injury impact & Opponent rank */}
        {(hasInjury || hasOpponentRank) && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {hasInjury && (
              <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                <h3 className="mb-3 text-sm font-semibold text-white/60">Without {row.without_player}</h3>
                <div className="text-2xl font-black text-white">
                  {Math.round(((row.without_player_hits ?? 0) / (row.without_player_games ?? 1)) * 100)}%
                </div>
                <p className="mt-1 text-sm text-white/70">
                  {row.without_player_hits} of {row.without_player_games} games missed by teammate
                </p>
              </div>
            )}
            {hasOpponentRank && (
              <div className="rounded-lg border border-white/10 bg-[#111620] p-4">
                <h3 className="mb-3 text-sm font-semibold text-white/60">{row.opponent_team ?? "Opponent"} Defensive Rank</h3>
                <div className="text-2xl font-black text-white">{ordinal(row.opponent_rank!)}</div>
                <p className="mt-1 text-sm text-white/70">of {row.opponent_team_count} teams</p>
              </div>
            )}
          </div>
        )}

        {/* Real market comparison */}
        {hasMarket && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/60">Market Line</h3>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-1 text-sm text-white/60">Line / Price</div>
                <div className="text-xl font-black text-white">
                  {row.direction === "over" ? "Over" : "Under"} {row.market_line} (
                  {row.market_price! > 0 ? "+" : ""}
                  {row.market_price})
                </div>
                {row.market_opening_line != null && row.market_opening_line !== row.market_line && (
                  <div className="mt-1 text-xs text-white/40">
                    Line moved: {row.market_opening_line} → {row.market_line}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 text-sm text-white/60">Recomputed Hit Rate</div>
                <div className="text-xl font-black text-white">
                  {row.market_hits}/{row.market_games}
                </div>
              </div>
              {row.edge != null && (
                <div>
                  <div className="mb-1 text-sm text-white/60">Edge</div>
                  <div className={`text-xl font-black ${row.edge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {row.edge >= 0 ? "+" : ""}
                    {Math.round(row.edge * 100)}%
                  </div>
                </div>
              )}
            </div>
            {row.kelly_fraction != null && row.kelly_fraction > 0 && (
              <div className="mt-3 text-sm text-emerald-400/80">
                Suggested stake: ${(bankroll * row.kelly_fraction).toFixed(2)} ({(row.kelly_fraction * 100).toFixed(1)}%
                of bankroll, ¼-Kelly)
              </div>
            )}
          </div>
        )}

        {/* Confidence explanation */}
        <div className="mb-6 rounded-lg border border-white/10 bg-[#111620] p-4">
          <h3 className="mb-2 text-sm font-semibold text-white/60">Confidence: {confidence.label}</h3>
          <p className="text-sm text-white/70">
            {confidence.ciWidthPct != null
              ? `95% confidence interval spans ${confidence.ciWidthPct} points.`
              : "Confidence interval unavailable for this sample."}{" "}
            {confidence.signalCount} confirming real signal{confidence.signalCount === 1 ? "" : "s"} found (split /
            H2H / injury / opponent rank / market edge).
          </p>
        </div>

        {/* Close Button */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

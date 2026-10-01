import type { CheatsheetRow } from "../api";

// These map 1:1 onto the real TrendGroups categories the backend computes in
// get_trend_groups() (backend/app/routers/trends.py) — no client-side
// re-derivation of "which signal counts", just real server-computed buckets.
// Shared by Trends.tsx and Cheatsheet.tsx, which previously duplicated all of this.
export type CategoryKey =
  | "all"
  | "recent_form"
  | "versus_opponent"
  | "home_away_splits"
  | "opponent_rank"
  | "injury_impact"
  | "alternate_lines"
  | "unders_only"
  | "team_form";

export const CATEGORIES: Array<{ key: CategoryKey; label: string; icon: string; description: string }> = [
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

export type SortKey = "hit_rate" | "games" | "edge" | "kelly";

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "hit_rate", label: "Hit Rate" },
  { key: "games", label: "Sample Size" },
  { key: "edge", label: "Market Edge" },
  { key: "kelly", label: "Kelly Fraction" },
];

export function sortValue(row: CheatsheetRow, key: SortKey): number {
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

export function sortRows(rows: CheatsheetRow[], key: SortKey): CheatsheetRow[] {
  return [...rows].sort((a, b) => sortValue(b, key) - sortValue(a, key));
}

// A range input's fill must be relative to its own min-max span, not the raw
// value — a slider with min=60 sitting at value=60 is at the LEFT edge (0%
// of the track), not 60% of it.
export function sliderFillPct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.round(((value - min) / (max - min)) * 100);
}

/** Stable identity for a signal so the same real pick isn't double-counted when it
 * appears in more than one TrendGroups category (the backend buckets are not
 * mutually exclusive for alternate_lines/unders_only/team_form). */
export function rowKey(row: CheatsheetRow): string {
  return `${row.player_name}|${row.stat_name}|${row.threshold}|${row.direction}|${row.game_id ?? "none"}`;
}

export const ALL_STAT_OPTION = "all";
export const ALL_TEAM_OPTION = "all";
// The backend baseline for every TrendGroups category is 60% hit rate (see
// min_hit_rate=0.6 in get_trend_groups) — any UI slider narrows further from
// there, it never reveals rows the API withheld below that floor.
export const MIN_HIT_RATE_FLOOR = 0.6;

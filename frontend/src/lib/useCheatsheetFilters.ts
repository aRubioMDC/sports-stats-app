import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_STAT_OPTION, ALL_TEAM_OPTION, CATEGORIES, MIN_HIT_RATE_FLOOR, SORT_OPTIONS } from "./cheatsheet-config";
import type { CategoryKey, SortKey } from "./cheatsheet-config";

export interface CheatsheetFilters {
  category: CategoryKey;
  search: string;
  statFilter: string;
  teamFilter: string;
  sortKey: SortKey;
  minHitRate: number;
  onlyMarketEdge: boolean;
}

const DEFAULT_FILTERS: CheatsheetFilters = {
  category: "all",
  search: "",
  statFilter: ALL_STAT_OPTION,
  teamFilter: ALL_TEAM_OPTION,
  sortKey: "hit_rate",
  minHitRate: MIN_HIT_RATE_FLOOR,
  onlyMarketEdge: false,
};

export function parseCheatsheetFilters(params: URLSearchParams): CheatsheetFilters {
  const category = params.get("cat");
  const sort = params.get("sort");
  const minPct = Number.parseInt(params.get("min") ?? "", 10);
  const floorPct = Math.round(MIN_HIT_RATE_FLOOR * 100);

  return {
    category: CATEGORIES.some((c) => c.key === category) ? (category as CategoryKey) : DEFAULT_FILTERS.category,
    search: params.get("q") ?? DEFAULT_FILTERS.search,
    statFilter: params.get("stat") ?? DEFAULT_FILTERS.statFilter,
    teamFilter: params.get("team") ?? DEFAULT_FILTERS.teamFilter,
    sortKey: SORT_OPTIONS.some((o) => o.key === sort) ? (sort as SortKey) : DEFAULT_FILTERS.sortKey,
    minHitRate: Number.isNaN(minPct) ? DEFAULT_FILTERS.minHitRate : Math.min(100, Math.max(floorPct, minPct)) / 100,
    onlyMarketEdge: params.get("edge") === "1",
  };
}

/** Defaults are omitted so an untouched page keeps a clean URL. */
export function encodeCheatsheetFilters(filters: CheatsheetFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const setOrDelete = (key: string, value: string | null) => {
    if (value == null) next.delete(key);
    else next.set(key, value);
  };

  setOrDelete("cat", filters.category === DEFAULT_FILTERS.category ? null : filters.category);
  setOrDelete("q", filters.search === DEFAULT_FILTERS.search ? null : filters.search);
  setOrDelete("stat", filters.statFilter === DEFAULT_FILTERS.statFilter ? null : filters.statFilter);
  setOrDelete("team", filters.teamFilter === DEFAULT_FILTERS.teamFilter ? null : filters.teamFilter);
  setOrDelete("sort", filters.sortKey === DEFAULT_FILTERS.sortKey ? null : filters.sortKey);
  setOrDelete(
    "min",
    Math.round(filters.minHitRate * 100) === Math.round(DEFAULT_FILTERS.minHitRate * 100)
      ? null
      : String(Math.round(filters.minHitRate * 100)),
  );
  setOrDelete("edge", filters.onlyMarketEdge ? "1" : null);

  return next;
}

/** Cheatsheet/Trends filter state kept in the URL so views are shareable and survive navigation. */
export function useCheatsheetFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseCheatsheetFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (patch: Partial<CheatsheetFilters>) => {
      setSearchParams((prev) => encodeCheatsheetFilters({ ...parseCheatsheetFilters(prev), ...patch }, prev), {
        replace: true,
      });
    },
    [setSearchParams],
  );

  return { filters, updateFilters };
}

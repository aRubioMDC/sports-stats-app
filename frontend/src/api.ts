const API_BASE = "/api";
// No sport switcher wired to real data yet — only NFL is registered on the backend.
const DEFAULT_SPORT = "nfl";

import { useQuery } from '@tanstack/react-query';

export interface Sport {
  slug: string;
  display_name: string;
}

export interface Config {
  current_season: number;
  current_week: number;
  last_updated: string | null;
}

export interface Team {
  id: number;
  abbreviation: string;
  name: string;
  primary_color: string;
  logo_url: string;
}

export interface Game {
  id: number;
  season: number;
  week: number;
  kickoff: string | null;
  home_team: Team;
  away_team: Team;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

export interface StatRow {
  label: string;
  home_value: number;
  home_rank: number;
  away_value: number;
  away_rank: number;
  leader: "home" | "away" | "tie";
}

export interface HeadToHeadResult {
  season: number;
  week: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

export interface MatchupContext {
  game: Game;
  window_mode: "current" | "blended";
  stat_rows: StatRow[];
  head_to_head: HeadToHeadResult[];
}

export interface CheatsheetRow {
  player_name: string;
  team: string;
  stat_name: string;
  threshold: number;
  direction: string;
  hits: number;
  games: number;
  hit_rate: number;
  hit_rate_ci_low?: number | null; // Wilson score lower bound
  hit_rate_ci_high?: number | null; // Wilson score upper bound
  market_line?: number | null; // real sportsbook line, if we have a matching quote
  market_price?: number | null; // American odds price for our side at that line
  market_implied_prob?: number | null; // de-vigged fair probability from market_price
  market_hits?: number | null; // our hit count recomputed against the REAL market line
  market_games?: number | null;
  edge?: number | null; // market_hits/market_games minus market_implied_prob
  without_player?: string | null;
  without_player_hits?: number | null;
  without_player_games?: number | null;
  opponent_rank?: number | null;
  opponent_team_count?: number | null;
  opponent_team?: string | null; // upcoming opponent abbreviation, e.g. "ATL"
  
  // Contextual signal data (Linemate-style badges)
  split_hits?: number | null;
  split_games?: number | null;
  h2h_hits?: number | null;
  h2h_games?: number | null;
  
  // Game information for sorting by upcoming games
  game_id?: number | null;
  game_kickoff?: string | null; // ISO datetime string
  is_home?: boolean | null;
}

export interface TeamGeneralStats {
  points_per_game: number;
  points_per_game_rank: number;
  yards_per_game: number;
  yards_per_game_rank: number;
}

export interface BoardGame {
  game: Game;
  home_form: string[];
  away_form: string[];
  home_stats: TeamGeneralStats | null;
  away_stats: TeamGeneralStats | null;
  top_trends: CheatsheetRow[];
}

export interface TrendGroups {
  recent_form: CheatsheetRow[];
  versus_opponent: CheatsheetRow[];
  alternate_lines: CheatsheetRow[];
  home_away_splits: CheatsheetRow[];
  unders_only: CheatsheetRow[];
  team_form: CheatsheetRow[];
  injury_impact: CheatsheetRow[];
  opponent_rank: CheatsheetRow[];
}

export interface Parlay {
  legs: CheatsheetRow[];
  summary_hits: number;
  summary_games: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

/** Fire-and-forget anonymous usage event — never throws, never blocks the UI. */
function trackEvent(eventName: string, metadata?: Record<string, unknown>): void {
  fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: eventName, sport: DEFAULT_SPORT, metadata }),
  }).catch(() => undefined);
}

export const api = {
  getSports: () => getJson<Sport[]>("/sports"),
  getConfig: () => getJson<Config>(`/${DEFAULT_SPORT}/config`),
  getGames: (season: number, week: number) =>
    getJson<Game[]>(`/${DEFAULT_SPORT}/games?season=${season}&week=${week}`),
  getMatchup: (gameId: number) => getJson<MatchupContext>(`/${DEFAULT_SPORT}/games/${gameId}/matchup`),
  getCheatsheet: (minHitRate = 1.0, minGames = 3, season?: number, week?: number, daysBack?: number) => {
    const params = new URLSearchParams({
      min_hit_rate: minHitRate.toString(),
      min_games: minGames.toString(),
    });
    if (season !== undefined) params.append('season', season.toString());
    if (week !== undefined) params.append('week', week.toString());
    if (daysBack !== undefined) params.append('days_back', daysBack.toString());
    return getJson<CheatsheetRow[]>(
      `/${DEFAULT_SPORT}/trends/cheatsheet?${params.toString()}`,
    );
  },
  getBoard: (season: number, week: number) =>
    getJson<BoardGame[]>(`/${DEFAULT_SPORT}/board?season=${season}&week=${week}`),
  getTrendGroups: (season?: number, week?: number, daysBack?: number) => {
    const params = new URLSearchParams();
    if (season !== undefined) params.append('season', season.toString());
    if (week !== undefined) params.append('week', week.toString());
    if (daysBack !== undefined) params.append('days_back', daysBack.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return getJson<TrendGroups>(`/${DEFAULT_SPORT}/trends/groups${query}`);
  },
  getTeams: () => getJson<Team[]>(`/${DEFAULT_SPORT}/teams`),
  getParlays: (gameId: number) => getJson<Parlay[]>(`/${DEFAULT_SPORT}/games/${gameId}/parlays`),
  getSamplePrices: () => getJson<number[]>(`/${DEFAULT_SPORT}/odds/sample`),
  refreshScores: () => postJson<{ last_updated: string }>(`/${DEFAULT_SPORT}/refresh`),
  trackEvent,
};

// ============= React Query Hooks (for caching across navigation) =============

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => api.getTeams(),
  });
}

export function useGames(season: number | null, week: number | null) {
  return useQuery({
    queryKey: ['games', season, week],
    queryFn: () => (season !== null && week !== null ? api.getGames(season, week) : Promise.resolve([])),
    enabled: season !== null && week !== null,
  });
}

export function useBoard(season: number | null, week: number | null) {
  return useQuery({
    queryKey: ['board', season, week],
    queryFn: () => (season !== null && week !== null ? api.getBoard(season, week) : Promise.resolve([])),
    enabled: season !== null && week !== null,
    staleTime: 60000, // 1 minute - highest priority, refresh more often
  });
}

export function useCheatsheet(minHitRate = 1.0, minGames = 3, season?: number, week?: number, daysBack?: number, enabled = true) {
  return useQuery({
    queryKey: ['cheatsheet', minHitRate, minGames, season, week, daysBack],
    queryFn: () => api.getCheatsheet(minHitRate, minGames, season, week, daysBack),
    enabled: enabled,
    staleTime: 90000, // 1.5 minutes - second priority
  });
}

export function useTrendGroups(season?: number, week?: number, daysBack?: number, enabled = true) {
  return useQuery({
    queryKey: ['trendGroups', season, week, daysBack],
    queryFn: () => api.getTrendGroups(season, week, daysBack),
    enabled: enabled,
    staleTime: 0, // Force fresh data to pick up new injury_impact/opponent_rank
  });
}

export function useMatchup(gameId: number | null) {
  return useQuery({
    queryKey: ['matchup', gameId],
    queryFn: () => (gameId !== null ? api.getMatchup(gameId) : Promise.reject('No gameId')),
    enabled: gameId !== null,
    staleTime: 120000, // 2 minutes
  });
}

export function useParlays(gameId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['parlays', gameId],
    queryFn: () => (gameId !== null ? api.getParlays(gameId) : Promise.resolve([])),
    enabled: gameId !== null && enabled,
    staleTime: 120000, // 2 minutes - background data
  });
}

export function useSamplePrices() {
  return useQuery({
    queryKey: ['samplePrices'],
    queryFn: () => api.getSamplePrices(),
  });
}

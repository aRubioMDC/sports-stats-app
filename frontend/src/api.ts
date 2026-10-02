const API_BASE = "/api";
const SPORT_STORAGE_KEY = "hitrate.sport";

export function getCurrentSport(): string {
  return localStorage.getItem(SPORT_STORAGE_KEY) ?? "nfl";
}

// Persists the choice and reloads — simplest way to get every page (each of
// which fetches independently, uncoupled from a global store) to refetch
// under the new sport, without threading a sport param through every hook.
export function setCurrentSport(sport: string): void {
  localStorage.setItem(SPORT_STORAGE_KEY, sport);
  window.location.reload();
}

// Frontend-only display concern — new sports still render with a sensible
// default icon until a dedicated one is added here.
const SPORT_ICONS: Record<string, string> = {
  nfl: "🏈",
  nhl: "🏒",
};

export function getSportIcon(sport: string): string {
  return SPORT_ICONS[sport] ?? "🏆";
}

import { useQuery } from '@tanstack/react-query';

export interface Sport {
  slug: string;
  display_name: string;
}

export interface Config {
  current_season: number;
  current_week: number;
  recommended_period: number;
  period_min: number;
  period_max: number;
  last_updated: string | null;
  period_unit: "week" | "day";
  period_anchor_date: string | null; // ISO date such that week N == this date + N days (only set when period_unit is "day")
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
  kickoff: string | null;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

export interface OddsSide {
  best_price: number;
  best_bookmaker: string;
  fair_prob: number | null;
}

export interface MoneylineMarket {
  home: OddsSide | null;
  away: OddsSide | null;
}

export interface SpreadMarket {
  point: number | null;
  home: OddsSide | null;
  away: OddsSide | null;
}

export interface TotalMarket {
  point: number | null;
  over: OddsSide | null;
  under: OddsSide | null;
}

export interface StandingsRow {
  team: string;
  logo_url: string;
  primary_color: string;
  wins: number;
  losses: number;
  ties: number;
  pct: number;
  is_in_game: boolean;
}

export interface RecentGame {
  season: number;
  week: number;
  kickoff: string | null;
  opponent: string;
  opponent_logo_url: string;
  is_home: boolean;
  result: "W" | "L" | "T";
  team_score: number;
  opponent_score: number;
}

export interface MatchupContext {
  game: Game;
  window_mode: "current" | "blended";
  stat_rows: StatRow[];
  head_to_head: HeadToHeadResult[];
  moneyline: MoneylineMarket | null;
  spread: SpreadMarket | null;
  total: TotalMarket | null;
  division: string | null;
  standings: StandingsRow[];
  home_recent_games: RecentGame[];
  away_recent_games: RecentGame[];
}

export interface CheatsheetRow {
  player_id?: number | null; // null for team-level rows (moneyline/team totals)
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
  market_opening_line?: number | null; // earliest recorded line from the same bookmaker
  market_price?: number | null; // American odds price for our side at that line
  market_implied_prob?: number | null; // de-vigged fair probability from market_price
  market_hits?: number | null; // our hit count recomputed against the REAL market line
  market_games?: number | null;
  edge?: number | null; // market_hits/market_games minus market_implied_prob
  kelly_fraction?: number | null; // suggested fraction of bankroll (quarter-Kelly), 0 when no edge
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
    body: JSON.stringify({ event_name: eventName, sport: getCurrentSport(), metadata }),
  }).catch((err) => {
    console.warn("trackEvent failed", { eventName, err });
  });
}

export interface PlayerInfo {
  id: number;
  full_name: string;
  position: string;
  team: string | null;
  headshot_url: string | null;
}

export const api = {
  getSports: () => getJson<Sport[]>("/sports"),
  getConfig: () => getJson<Config>(`/${getCurrentSport()}/config`),
  getPlayerInfo: (playerId: number) => getJson<PlayerInfo>(`/${getCurrentSport()}/players/${playerId}`),
  getPlayerCheatsheet: (playerId: number) =>
    getJson<CheatsheetRow[]>(`/${getCurrentSport()}/players/${playerId}/cheatsheet`),
  getGames: (season: number, week: number) =>
    getJson<Game[]>(`/${getCurrentSport()}/games?season=${season}&week=${week}`),
  getMatchup: (gameId: number) => getJson<MatchupContext>(`/${getCurrentSport()}/games/${gameId}/matchup`),
  getCheatsheet: (minHitRate = 1.0, minGames = 3, season?: number, week?: number, daysBack?: number) => {
    const params = new URLSearchParams({
      min_hit_rate: minHitRate.toString(),
      min_games: minGames.toString(),
    });
    if (season !== undefined) params.append('season', season.toString());
    if (week !== undefined) params.append('week', week.toString());
    if (daysBack !== undefined) params.append('days_back', daysBack.toString());
    return getJson<CheatsheetRow[]>(
      `/${getCurrentSport()}/trends/cheatsheet?${params.toString()}`,
    );
  },
  getBoard: (season: number, week: number) =>
    getJson<BoardGame[]>(`/${getCurrentSport()}/board?season=${season}&week=${week}`),
  getByeTeams: (season: number, week: number) =>
    getJson<Team[]>(`/${getCurrentSport()}/board/byes?season=${season}&week=${week}`),
  getTrendGroups: (season?: number, week?: number, daysBack?: number) => {
    const params = new URLSearchParams();
    if (season !== undefined) params.append('season', season.toString());
    if (week !== undefined) params.append('week', week.toString());
    if (daysBack !== undefined) params.append('days_back', daysBack.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return getJson<TrendGroups>(`/${getCurrentSport()}/trends/groups${query}`);
  },
  getTeams: () => getJson<Team[]>(`/${getCurrentSport()}/teams`),
  getParlays: (gameId: number) => getJson<Parlay[]>(`/${getCurrentSport()}/games/${gameId}/parlays`),
  getSamplePrices: () => getJson<number[]>(`/${getCurrentSport()}/odds/sample`),
  refreshScores: () => postJson<{ last_updated: string }>(`/${getCurrentSport()}/refresh`),
  openScoresStream: () => new EventSource(`${API_BASE}/${getCurrentSport()}/scores/stream`),
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

export function useByeTeams(season: number | null, week: number | null) {
  return useQuery({
    queryKey: ['byeTeams', season, week],
    queryFn: () => (season !== null && week !== null ? api.getByeTeams(season, week) : Promise.resolve([])),
    enabled: season !== null && week !== null,
    staleTime: 300000, // 5 minutes - real schedule data, rarely changes
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

export function usePlayerInfo(playerId: number | null) {
  return useQuery({
    queryKey: ['playerInfo', playerId],
    queryFn: () => (playerId !== null ? api.getPlayerInfo(playerId) : Promise.reject('No playerId')),
    enabled: playerId !== null,
    staleTime: 300000, // 5 minutes - identity rarely changes
  });
}

export function usePlayerCheatsheet(playerId: number | null) {
  return useQuery({
    queryKey: ['playerCheatsheet', playerId],
    queryFn: () => (playerId !== null ? api.getPlayerCheatsheet(playerId) : Promise.resolve([])),
    enabled: playerId !== null,
    staleTime: 60000,
  });
}

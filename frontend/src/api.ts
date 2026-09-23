const API_BASE = "/api";
// No sport switcher wired to real data yet — only NFL is registered on the backend.
const DEFAULT_SPORT = "nfl";

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
  without_player?: string | null;
  opponent_rank?: number | null;
  opponent_team_count?: number | null;
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
  getCheatsheet: (minHitRate = 1.0, minGames = 3) =>
    getJson<CheatsheetRow[]>(
      `/${DEFAULT_SPORT}/trends/cheatsheet?min_hit_rate=${minHitRate}&min_games=${minGames}`,
    ),
  getBoard: (season: number, week: number) =>
    getJson<BoardGame[]>(`/${DEFAULT_SPORT}/board?season=${season}&week=${week}`),
  getTrendGroups: () => getJson<TrendGroups>(`/${DEFAULT_SPORT}/trends/groups`),
  getTeams: () => getJson<Team[]>(`/${DEFAULT_SPORT}/teams`),
  getParlays: (gameId: number) => getJson<Parlay[]>(`/${DEFAULT_SPORT}/games/${gameId}/parlays`),
  getSamplePrices: () => getJson<number[]>(`/${DEFAULT_SPORT}/odds/sample`),
  refreshScores: () => postJson<{ last_updated: string }>(`/${DEFAULT_SPORT}/refresh`),
  trackEvent,
};

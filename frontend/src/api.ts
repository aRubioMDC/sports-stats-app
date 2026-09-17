const API_BASE = "/api";
// No sport switcher yet — the backend supports multiple sports, the UI only exposes NFL for now.
const DEFAULT_SPORT = "nfl";

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
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getGames: (season: number, week: number) =>
    getJson<Game[]>(`/${DEFAULT_SPORT}/games?season=${season}&week=${week}`),
  getMatchup: (gameId: number) => getJson<MatchupContext>(`/${DEFAULT_SPORT}/games/${gameId}/matchup`),
  getCheatsheet: (minHitRate = 1.0, minGames = 3) =>
    getJson<CheatsheetRow[]>(
      `/${DEFAULT_SPORT}/trends/cheatsheet?min_hit_rate=${minHitRate}&min_games=${minGames}`,
    ),
};

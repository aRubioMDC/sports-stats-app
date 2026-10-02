import { expect, test, type Page } from '@playwright/test';

const sports = [{ slug: 'nfl', display_name: 'NFL' }];

const config = {
  current_season: 2026,
  current_week: 3,
  recommended_period: 3,
  period_min: 1,
  period_max: 22,
  last_updated: '2026-10-01T00:00:00Z',
  period_unit: 'week',
  period_anchor_date: null,
};

const teams = [
  {
    id: 1,
    abbreviation: 'KC',
    name: 'Kansas City Chiefs',
    primary_color: '#E31837',
    logo_url: '',
  },
  {
    id: 2,
    abbreviation: 'BUF',
    name: 'Buffalo Bills',
    primary_color: '#00338D',
    logo_url: '',
  },
  {
    id: 3,
    abbreviation: 'MIA',
    name: 'Miami Dolphins',
    primary_color: '#008E97',
    logo_url: '',
  },
  {
    id: 4,
    abbreviation: 'NYJ',
    name: 'New York Jets',
    primary_color: '#125740',
    logo_url: '',
  },
];

const board = [
  {
    game: {
      id: 1001,
      season: 2026,
      week: 3,
      kickoff: '2026-10-03T18:20:00Z',
      home_team: teams[0],
      away_team: teams[1],
      home_score: null,
      away_score: null,
      status: 'scheduled',
    },
    home_form: ['W', 'W', 'L'],
    away_form: ['W', 'L', 'W'],
    home_stats: { points_per_game: 27.5, points_per_game_rank: 3, yards_per_game: 390.2, yards_per_game_rank: 4 },
    away_stats: { points_per_game: 24.1, points_per_game_rank: 8, yards_per_game: 370.6, yards_per_game_rank: 9 },
    top_trends: [
      {
        player_name: 'Travis Kelce',
        team: 'KC',
        stat_name: 'receiving_yards',
        threshold: 50,
        direction: 'over',
        hits: 4,
        games: 5,
        hit_rate: 0.8,
      },
    ],
  },
  {
    game: {
      id: 1002,
      season: 2026,
      week: 3,
      kickoff: '2026-10-04T17:00:00Z',
      home_team: teams[2],
      away_team: teams[3],
      home_score: 24,
      away_score: 17,
      status: 'final',
    },
    home_form: ['W', 'W', 'W'],
    away_form: ['L', 'L', 'W'],
    home_stats: { points_per_game: 26.2, points_per_game_rank: 5, yards_per_game: 381.7, yards_per_game_rank: 6 },
    away_stats: { points_per_game: 18.4, points_per_game_rank: 25, yards_per_game: 320.3, yards_per_game_rank: 24 },
    top_trends: [],
  },
];

const trendRow = {
  player_id: 10,
  player_name: 'Stefon Diggs',
  team: 'BUF',
  stat_name: 'receiving_yards',
  threshold: 60,
  direction: 'over',
  hits: 5,
  games: 6,
  hit_rate: 0.83,
  h2h_hits: 2,
  h2h_games: 2,
  split_hits: 3,
  split_games: 3,
  opponent_team: 'KC',
  game_id: 1001,
  game_kickoff: '2026-10-03T18:20:00Z',
  is_home: false,
};

const trendGroups = {
  recent_form: [trendRow],
  versus_opponent: [trendRow],
  alternate_lines: [],
  home_away_splits: [trendRow],
  unders_only: [],
  team_form: [],
  injury_impact: [],
  opponent_rank: [],
};

async function installApiMocks(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (route.request().method() === 'POST' && url.pathname === '/api/events') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname === '/api/sports') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sports) });
      return;
    }

    if (url.pathname === '/api/nfl/config') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
      return;
    }

    if (url.pathname === '/api/nfl/teams') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teams) });
      return;
    }

    if (url.pathname === '/api/nfl/board') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(board) });
      return;
    }

    if (url.pathname === '/api/nfl/trends/cheatsheet') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([trendRow]) });
      return;
    }

    if (url.pathname === '/api/nfl/trends/groups') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(trendGroups) });
      return;
    }

    if (url.pathname === '/api/nfl/games/1001/parlays') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    if (url.pathname === '/api/nfl/scores/stream') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
        body: 'event: ping\ndata: ok\n\n',
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not mocked' }) });
  });
}

test.describe('Home smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
  });

  test('renders key dashboard sections from live-like API responses', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Week 3/i })).toBeVisible();
    await expect(page.getByText('Showing 1 games')).toBeVisible();
    await expect(page.getByText('Trending Today')).toBeVisible();
    await expect(page.getByText('Cheatsheets')).toBeVisible();
    await expect(page.getByRole('link', { name: /View all/i })).toBeVisible();
  });

  test('supports basic navigation from home to trends and cheatsheet pages', async ({ page }) => {
    await page.goto('/');

    await page.locator('header nav').getByRole('link', { name: 'Trends' }).click();
    await expect(page).toHaveURL(/\/trends$/);
    await expect(page.getByRole('heading', { name: 'Trends Today' })).toBeVisible();

    await page.locator('header nav').getByRole('link', { name: 'Cheatsheet' }).click();
    await expect(page).toHaveURL(/\/cheatsheet$/);
    await expect(page.getByRole('heading', { name: 'Hit-Rate Cheatsheet' })).toBeVisible();
  });
});

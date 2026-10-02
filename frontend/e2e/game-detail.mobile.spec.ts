import { expect, test, type Page } from '@playwright/test';

import matchup from './fixtures/nhl-game-matchup.json' with { type: 'json' };
import prediction from './fixtures/nhl-game-prediction.json' with { type: 'json' };

// Fixtures are real NHL responses captured from the API (logos stripped to stay offline).
const GAME_ID = matchup.game.id;

const config = {
  current_season: matchup.game.season,
  current_week: matchup.game.week,
  recommended_period: matchup.game.week,
  period_min: 1,
  period_max: 190,
  last_updated: '2026-10-02T00:00:00Z',
  period_unit: 'day',
  period_anchor_date: '2026-02-20',
};

async function installApiMocks(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('hitrate.sport', 'nhl'));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (route.request().method() === 'POST') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/api/sports') return json([{ slug: 'nhl', display_name: 'NHL' }]);
    if (url.pathname === '/api/nhl/config') return json(config);
    if (url.pathname === `/api/nhl/games/${GAME_ID}/matchup`) return json(matchup);
    if (url.pathname === `/api/nhl/games/${GAME_ID}/prediction`) return json(prediction);
    if (url.pathname === '/api/nhl/scores/stream') {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: 'event: ping\ndata: ok\n\n',
      });
    }
    return json([]);
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Game detail on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
  });

  for (const tab of ['overview', 'analytics', 'trends'] as const) {
    test(`${tab} tab does not scroll sideways`, async ({ page }) => {
      await page.goto(`/games/${GAME_ID}?tab=${tab}`);
      await expect(page.getByRole('heading', { name: /@/ })).toBeAttached();
      await page.waitForLoadState('networkidle');

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('all three tabs fit on one line', async ({ page }) => {
    await page.goto(`/games/${GAME_ID}`);

    const tops = await Promise.all(
      ['Overview', 'Analytics', 'Trends'].map(async (name) => {
        const box = await page.getByRole('button', { name: new RegExp(`^${name}`) }).boundingBox();
        return Math.round(box?.y ?? -1);
      }),
    );
    expect(new Set(tops).size).toBe(1);
  });

  test('analytics shows the model and the market side by side', async ({ page }) => {
    await page.goto(`/games/${GAME_ID}?tab=analytics`);

    await expect(page.getByText('Game Outlook')).toBeVisible();
    await expect(page.getByText(/Market 54%/)).toBeVisible();
  });
});

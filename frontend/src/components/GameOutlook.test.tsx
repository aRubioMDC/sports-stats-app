import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Game, GamePrediction, MatchupContext } from '../api';
import { GameOutlook } from './GameOutlook';

const team = (id: number, abbreviation: string) => ({
  id,
  abbreviation,
  name: abbreviation,
  primary_color: '#123456',
  logo_url: '',
});

const game: Game = {
  id: 1,
  season: 2026,
  week: 5,
  kickoff: null,
  home_team: team(1, 'WAS'),
  away_team: team(2, 'IND'),
  home_score: null,
  away_score: null,
  status: 'scheduled',
};

const context = {
  game,
  moneyline: {
    home: { best_price: 171, best_bookmaker: 'lowvig', fair_prob: 0.364 },
    away: { best_price: -184, best_bookmaker: 'fanduel', fair_prob: 0.636 },
  },
  spread: null,
  total: null,
} as unknown as MatchupContext;

const prediction: GamePrediction = {
  available: true,
  reason: null,
  model: 'test',
  projected_home: 25,
  projected_away: 27,
  projected_total: 52,
  league_games: 190,
  home_games: 11.5,
  away_games: 11.5,
  low_sample: false,
  win: { home: 0.44, away: 0.56 },
  margin_buckets: [{ label: '1-3', home: 0.08, away: 0.09 }],
  totals: [{ line: 51.5, over: 0.51, under: 0.49 }],
  home_team_totals: [{ line: 24.5, over: 0.5, under: 0.5 }],
  away_team_totals: [{ line: 26.5, over: 0.5, under: 0.5 }],
  spreads: [],
  market: { home_win: 0.364, away_win: 0.636, total_point: null, total_over: null, spread_point: null },
};

describe('GameOutlook', () => {
  it('shows model probabilities next to the real market price with the sign of the gap', () => {
    render(<GameOutlook game={game} context={context} prediction={prediction} isLoading={false} />);

    expect(screen.getByText('Game Outlook')).toBeInTheDocument();
    expect(screen.getByText('44%')).toBeInTheDocument();
    expect(screen.getByText('Market 36%')).toBeInTheDocument();
    expect(screen.getByText('+8 pts vs market')).toBeInTheDocument();
    expect(screen.getByText('\u22128 pts vs market')).toBeInTheDocument();
    expect(screen.getByText(/IND 27.0 – 25.0 WAS/)).toBeInTheDocument();
  });

  it('switches between totals, margin and spread views', () => {
    const withSpread = { ...prediction, spreads: [{ home_line: 2.5, home_cover: 0.5, away_cover: 0.5 }] };
    render(<GameOutlook game={game} context={context} prediction={withSpread} isLoading={false} />);

    expect(screen.getByRole('button', { name: 'Totals' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('51.5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    expect(screen.getByRole('button', { name: 'Margin' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1-3')).toBeInTheDocument();
    expect(screen.queryByText('51.5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Spread' }));
    expect(screen.getByText('WAS +2.5')).toBeInTheDocument();
  });

  it('falls back to market-only odds when the model is unavailable', () => {
    const unavailable = { ...prediction, available: false, win: null, reason: 'No data' };
    render(<GameOutlook game={game} context={context} prediction={unavailable} isLoading={false} />);

    expect(screen.getByText('Real Market Odds')).toBeInTheDocument();
    expect(screen.queryByText('Game Outlook')).not.toBeInTheDocument();
  });

  it('renders nothing when there is neither a model nor market prices', () => {
    const empty = { ...context, moneyline: null } as unknown as MatchupContext;
    const { container } = render(<GameOutlook game={game} context={empty} prediction={undefined} isLoading={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('flags small samples honestly', () => {
    render(<GameOutlook game={game} context={context} prediction={{ ...prediction, low_sample: true }} isLoading={false} />);

    expect(screen.getByText(/Small sample/)).toBeInTheDocument();
  });
});

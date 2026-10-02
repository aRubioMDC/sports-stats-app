import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CheatsheetRow } from '../api';
import { CheatsheetGroups } from './CheatsheetGroups';

function makeRow(playerName: string): CheatsheetRow {
  return {
    player_name: playerName,
    team: 'BUF',
    stat_name: 'receiving_yards',
    threshold: 50,
    direction: 'over',
    hits: 4,
    games: 4,
    hit_rate: 1,
  };
}

describe('CheatsheetGroups', () => {
  it('shows explicit empty state when there are no categories with data', () => {
    render(
      <CheatsheetGroups
        recentForm={[]}
        versusOpponent={[]}
        alternateLines={[]}
        homeAwaySplits={[]}
        undersOnly={[]}
        teamForm={[]}
      />,
    );

    expect(screen.getByText('Cheatsheets')).toBeInTheDocument();
    expect(screen.getByText(/No trending categories are available/i)).toBeInTheDocument();
  });

  it('paginates categories when there are more than three groups with data', () => {
    render(
      <CheatsheetGroups
        recentForm={[makeRow('Player A')]}
        versusOpponent={[makeRow('Player B')]}
        alternateLines={[makeRow('Player C')]}
        homeAwaySplits={[makeRow('Player D')]}
        undersOnly={[]}
        teamForm={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Next categories' })).toBeInTheDocument();
    expect(screen.getByText('100% Recent Form')).toBeInTheDocument();
    expect(screen.queryByText('100% Home/Away Games')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next categories' }));

    expect(screen.getByText('100% Home/Away Games')).toBeInTheDocument();
  });
});

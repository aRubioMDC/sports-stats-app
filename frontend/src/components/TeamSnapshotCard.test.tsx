import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TeamSnapshotCard } from './TeamSnapshotCard';

describe('TeamSnapshotCard', () => {
  it('shows N/A snapshot and guidance when pace stats are not available', () => {
    render(
      <TeamSnapshotCard
        abbreviation="BUF"
        logoUrl=""
        primaryColor="#00338D"
        form={[]}
        ppg={undefined}
        ppgRank={undefined}
        ypg={undefined}
        ypgRank={undefined}
        isDayBased={false}
      />,
    );

    expect(screen.getByText('Not enough games yet to compute team pace stats.')).toBeInTheDocument();
    expect(screen.getAllByText('N/A')).toHaveLength(2);
    expect(screen.getByText(/PPG/i)).toBeInTheDocument();
    expect(screen.getByText(/YPG/i)).toBeInTheDocument();
  });

  it('uses NHL-specific labels when day-based periods are active', () => {
    render(
      <TeamSnapshotCard
        abbreviation="MTL"
        logoUrl=""
        primaryColor="#AF1E2D"
        form={['W']}
        ppg={3.1}
        ppgRank={4}
        ypg={2.7}
        ypgRank={6}
        isDayBased={true}
      />,
    );

    expect(screen.getByText(/PTS Pace/i)).toBeInTheDocument();
    expect(screen.getByText(/GF\/GP/i)).toBeInTheDocument();
    expect(screen.getByText('3.1')).toBeInTheDocument();
    expect(screen.getByText('2.7')).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import { getCurrentSport, getSportIcon } from './api';

describe('api sport helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to nfl when there is no saved sport', () => {
    expect(getCurrentSport()).toBe('nfl');
  });

  it('returns saved sport from localStorage', () => {
    localStorage.setItem('hitrate.sport', 'nhl');
    expect(getCurrentSport()).toBe('nhl');
  });

  it('returns fallback icon for unknown sports', () => {
    expect(getSportIcon('mlb')).toBe('🏆');
  });

  it('returns known icon for nfl', () => {
    expect(getSportIcon('nfl')).toBe('🏈');
  });
});

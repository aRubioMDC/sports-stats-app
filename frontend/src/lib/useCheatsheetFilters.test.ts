import { describe, expect, it } from 'vitest';

import { encodeCheatsheetFilters, parseCheatsheetFilters } from './useCheatsheetFilters';

describe('parseCheatsheetFilters', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseCheatsheetFilters(new URLSearchParams())).toEqual({
      category: 'all',
      search: '',
      statFilter: 'all',
      teamFilter: 'all',
      sortKey: 'hit_rate',
      minHitRate: 0.6,
      onlyMarketEdge: false,
    });
  });

  it('reads valid values from the URL', () => {
    const filters = parseCheatsheetFilters(
      new URLSearchParams('cat=unders_only&q=allen&stat=goals&team=BUF&sort=edge&min=75&edge=1'),
    );

    expect(filters).toMatchObject({
      category: 'unders_only',
      search: 'allen',
      statFilter: 'goals',
      teamFilter: 'BUF',
      sortKey: 'edge',
      minHitRate: 0.75,
      onlyMarketEdge: true,
    });
  });

  it('falls back to defaults for unknown category/sort and clamps min hit rate', () => {
    const invalid = parseCheatsheetFilters(new URLSearchParams('cat=nope&sort=nope&min=abc'));
    expect(invalid.category).toBe('all');
    expect(invalid.sortKey).toBe('hit_rate');
    expect(invalid.minHitRate).toBe(0.6);

    expect(parseCheatsheetFilters(new URLSearchParams('min=10')).minHitRate).toBe(0.6);
    expect(parseCheatsheetFilters(new URLSearchParams('min=250')).minHitRate).toBe(1);
  });
});

describe('encodeCheatsheetFilters', () => {
  it('omits defaults so an untouched page keeps a clean URL', () => {
    const defaults = parseCheatsheetFilters(new URLSearchParams());
    expect(encodeCheatsheetFilters(defaults, new URLSearchParams()).toString()).toBe('');
  });

  it('round-trips non-default filters and preserves unrelated params', () => {
    const filters = parseCheatsheetFilters(new URLSearchParams('cat=recent_form&min=80&edge=1'));
    const encoded = encodeCheatsheetFilters(filters, new URLSearchParams('sport=nhl'));

    expect(encoded.get('sport')).toBe('nhl');
    expect(parseCheatsheetFilters(encoded)).toEqual(filters);
  });

  it('removes a param when its filter returns to the default', () => {
    const base = new URLSearchParams('cat=recent_form');
    const filters = { ...parseCheatsheetFilters(base), category: 'all' as const };

    expect(encodeCheatsheetFilters(filters, base).has('cat')).toBe(false);
  });
});

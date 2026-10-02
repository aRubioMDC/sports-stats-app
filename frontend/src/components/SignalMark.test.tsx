import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { pctSignalMark } from '../lib/statLabels';
import { SignalMark } from './SignalMark';

describe('pctSignalMark', () => {
  it('maps hit-rate strength to a glyph without relying on color', () => {
    expect(pctSignalMark(70)).toEqual({ glyph: '▲', label: 'Strong' });
    expect(pctSignalMark(69.9)).toEqual({ glyph: '●', label: 'Mixed' });
    expect(pctSignalMark(50)).toEqual({ glyph: '●', label: 'Mixed' });
    expect(pctSignalMark(49.9)).toEqual({ glyph: '▼', label: 'Weak' });
  });
});

describe('SignalMark', () => {
  it('renders a hidden glyph plus a screen-reader label', () => {
    render(<SignalMark pct={85} />);

    expect(screen.getByText('▲')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Strong:')).toHaveClass('sr-only');
  });
});

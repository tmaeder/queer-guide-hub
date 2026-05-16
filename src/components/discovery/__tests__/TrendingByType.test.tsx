/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const stripSpy = vi.fn();
vi.mock('../TrendingStrip', () => ({
  TrendingStrip: (props: { title: string; types: string[]; limit?: number; city?: string }) => {
    stripSpy(props);
    return <div data-testid="strip">{props.title}</div>;
  },
}));

import { TrendingByType } from '../TrendingByType';

describe('TrendingByType', () => {
  it('renders TrendingStrip with venue title and types', () => {
    render(<TrendingByType type="venue" />);
    expect(screen.getByText('Trending venues')).toBeInTheDocument();
    expect(stripSpy.mock.calls[0][0].types).toEqual(['venue']);
  });

  it('uses neighborhood title for queer_village', () => {
    render(<TrendingByType type="queer_village" />);
    expect(screen.getByText('Trending neighborhoods')).toBeInTheDocument();
  });

  it('forwards city + limit through to TrendingStrip', () => {
    render(<TrendingByType type="event" city="Berlin" limit={5} />);
    expect(stripSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ city: 'Berlin', limit: 5, types: ['event'] }),
    );
  });
});

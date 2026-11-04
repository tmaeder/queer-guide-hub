/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const state = vi.hoisted(() => ({ recent: [] as unknown[] }));
vi.mock('@/hooks/useRecentlyViewed', () => ({ useRecentlyViewed: () => state.recent }));

import { YourLines } from '../YourLines';

beforeEach(() => {
  state.recent = [];
});

describe('YourLines', () => {
  it('self-hides for a visitor with no history', () => {
    const { container } = renderWithProviders(<YourLines />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders up to three recent destinations in reading order', () => {
    state.recent = ['a', 'a', 'b', 'c', 'd'].map((slug) => ({
      type: 'venue',
      slug,
      title: `Venue ${slug}`,
    }));
    renderWithProviders(<YourLines />);
    const recent = screen.getByRole('region', { name: 'Recently viewed' });
    expect(Array.from(recent.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual([
      '/venues/a',
      '/venues/b',
      '/venues/c',
    ]);
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { CityNewsTab } from '../CityNewsTab';

const renderTab = (articles: unknown) =>
  render(
    <MemoryRouter>
      <CityNewsTab articles={articles as never} locale="en-GB" openLabel="Open" />
    </MemoryRouter>,
  );

describe('CityNewsTab', () => {
  it('renders nothing when there are no articles', () => {
    // Rule 2: no empty shell. 2,200 of 3,070 cities have no coverage, and the
    // page drops the whole section for them rather than printing "check back
    // later".
    const { container } = renderTab([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders five dated headline rows, not a card grid', () => {
    // Six NewsCards cost 1,273px on Berlin. The module is context on a city
    // page; the feed is one link away.
    const articles = Array.from({ length: 10 }).map((_, i) => ({
      id: String(i),
      title: `T${i}`,
      slug: `t-${i}`,
      published_at: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }));
    renderTab(articles);
    expect(screen.getAllByRole('link', { name: /^T\d$/ })).toHaveLength(5);
    expect(screen.getByText('1 AUG')).toBeInTheDocument();
    expect(screen.getByText('5 AUG')).toBeInTheDocument();
  });

  it('does not ink-flood the first row — newest is not "your next departure"', () => {
    const { container } = renderTab([
      { id: 'a', title: 'Newest', slug: 'newest', published_at: '2026-08-14' },
      { id: 'b', title: 'Older', slug: 'older', published_at: '2026-08-01' },
    ]);
    expect(container.querySelector('.bg-foreground')).toBeNull();
  });
});

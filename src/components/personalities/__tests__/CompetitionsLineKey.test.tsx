import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { COMPETITION_CATEGORIES, categoryPath } from '@/lib/competitionCategories';

const state: {
  counts: Map<string, { competitions: number; editions: number }>;
  isLoading: boolean;
  isError: boolean;
} = { counts: new Map(), isLoading: false, isError: false };

vi.mock('@/hooks/useCompetitions', () => ({
  useCompetitionCategoryCounts: () => state,
}));
// A t() that returns the default copy and makes the pluralised count visible,
// so the assertions read numbers rather than bare keys.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opt?: string | { count?: number }) =>
      typeof opt === 'string' ? opt : opt?.count !== undefined ? `${key}:${opt.count}` : key,
  }),
}));
vi.mock('@/hooks/useReferenceTaxonomy', () => ({ useReferenceTaxonomy: vi.fn() }));

import { CompetitionsLineKey } from '../CompetitionsLineKey';

function renderKey() {
  return render(
    <MemoryRouter>
      <CompetitionsLineKey />
    </MemoryRouter>,
  );
}

describe('CompetitionsLineKey', () => {
  beforeEach(() => {
    state.counts = new Map();
    state.isLoading = false;
    state.isError = false;
  });

  it('routes to every category page and to the hub', () => {
    renderKey();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    // Positive control: the categories list is not empty, so "every category
    // is linked" is not satisfied vacuously.
    expect(COMPETITION_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    for (const c of COMPETITION_CATEGORIES) expect(hrefs).toContain(categoryPath(c));
    expect(hrefs).toContain('/competitions');
  });

  it('says zero for a loaded category with no rows, and Counting only while loading', () => {
    const first = COMPETITION_CATEGORIES[0];
    state.counts = new Map([[first.id, { competitions: 33, editions: 114 }]]);
    const { unmount } = renderKey();
    const firstLink = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === categoryPath(first))!;
    expect(firstLink.textContent).toContain('hubCountCompetitions:33');
    expect(firstLink.textContent).toContain('hubCountEditions:114');
    const second = COMPETITION_CATEGORIES[1];
    const secondLink = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === categoryPath(second))!;
    expect(secondLink.textContent).toContain('hubCountCompetitions:0');
    expect(screen.queryByText('Counting')).toBeNull();
    unmount();

    state.isLoading = true;
    renderKey();
    expect(screen.getAllByText('Counting')).toHaveLength(COMPETITION_CATEGORIES.length);
  });

  it('keeps the routes when the counts fail to load', () => {
    state.isError = true;
    renderKey();
    expect(screen.getAllByRole('link')).toHaveLength(COMPETITION_CATEGORIES.length + 1);
    expect(screen.queryByText('Counting')).toBeNull();
  });
});

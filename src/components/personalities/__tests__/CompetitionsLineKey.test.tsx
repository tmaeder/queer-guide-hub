import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { COMPETITION_CATEGORIES, categoryPath } from '@/lib/competitionCategories';

const state: {
  counts: Map<string, { competitions: number; editions: number }>;
  isLoading: boolean;
  isError: boolean;
} = { counts: new Map(), isLoading: false, isError: false };

const people: { value: Map<string, number> | null } = { value: null };
const options: { value: { slug: string; name: string; category: string; people: number }[] } = {
  value: [],
};

vi.mock('@/hooks/useCompetitions', () => ({
  useCompetitionCategoryCounts: () => state,
  useCompetitionCategoryPeople: () => ({ data: people.value }),
  useCompetedInOptions: () => ({ data: options.value }),
}));
// A t() that returns the default copy and makes the pluralised count visible,
// so the assertions read numbers rather than bare keys.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
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
    people.value = null;
    options.value = [];
  });

  it('routes to every category page and to the hub', () => {
    renderKey();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    // Positive control: the categories list is not empty, so "every category
    // is linked" is not satisfied vacuously.
    expect(COMPETITION_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    for (const c of COMPETITION_CATEGORIES) {
      expect(hrefs).toContain(categoryPath(c));
      // People link is present while the counts are unknown.
      expect(hrefs).toContain(`/personalities?competed=${c.id}`);
    }
    expect(hrefs).toContain('/competitions');
  });

  it('keeps a type with nobody linked, as an unlinked People 0, never a dead link', () => {
    const [withPeople, empty] = COMPETITION_CATEGORIES;
    people.value = new Map([[withPeople.id, 423]]);
    renderKey();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(`/personalities?competed=${withPeople.id}`);
    expect(hrefs).not.toContain(`/personalities?competed=${empty.id}`);
    // The type's own page stays linked either way.
    expect(hrefs).toContain(categoryPath(empty));
    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === `/personalities?competed=${withPeople.id}`)!;
    expect(link.textContent).toContain('423');
    // The empty type's row is still there, with its zero stated as text.
    // Every other type has a measured zero here: each row is still rendered,
    // with its zero stated as text rather than linked.
    const zeros = screen.getAllByLabelText('pages.personalities.competitions.peopleNone');
    expect(zeros).toHaveLength(COMPETITION_CATEGORIES.length - 1);
    for (const z of zeros) {
      expect(z.tagName).not.toBe('A');
      expect(z.textContent).toContain('0');
    }
  });

  it('never shows a zero while the counts are unknown', () => {
    renderKey();
    expect(screen.queryAllByLabelText('pages.personalities.competitions.peopleNone')).toHaveLength(
      0,
    );
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
    expect(screen.getAllByRole('link')).toHaveLength(2 * COMPETITION_CATEGORIES.length + 1);
    expect(screen.queryByText('Counting')).toBeNull();
  });

  it('names the three biggest competitions per type, each linked to its filter, then +N more', () => {
    const [series] = COMPETITION_CATEGORIES;
    options.value = [
      { slug: 'small', name: 'Small Show', category: series.id, people: 2 },
      { slug: 'big', name: 'Big Show', category: series.id, people: 194 },
      { slug: 'mid-b', name: 'Beta Show', category: series.id, people: 48 },
      { slug: 'mid-a', name: 'Alpha Show', category: series.id, people: 48 },
      { slug: 'other-type', name: 'Elsewhere', category: 'not-this-row', people: 99 },
    ];
    renderKey();
    const named = screen
      .getAllByRole('link')
      .filter((a) => /competed=(big|mid-a|mid-b|small)$/.test(a.getAttribute('href') ?? ''));
    // Biggest first, ties by name; the fourth is left to "+1 more".
    expect(named.map((a) => a.getAttribute('href'))).toEqual([
      '/personalities?competed=big',
      '/personalities?competed=mid-a',
      '/personalities?competed=mid-b',
    ]);
    expect(named[0].textContent).toContain('194');
    const more = screen.getByText('pages.personalities.competitions.more:1');
    expect(more.closest('a')?.getAttribute('href')).toBe(categoryPath(series));
  });

  it('names no competitions while their counts are unavailable', () => {
    renderKey();
    expect(
      screen
        .getAllByRole('link')
        .filter(
          (a) =>
            /competed=[a-z0-9-]+$/.test(a.getAttribute('href') ?? '') &&
            !a.getAttribute('href')!.includes('_'),
        ),
    ).toHaveLength(0);
  });
});

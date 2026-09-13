import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompetitionSeasonTable } from '../CompetitionSeasonTable';
import type { Competition, CompetitionEdition, CompetitionKind } from '@/types/competition';
import type { CompetitionCategory } from '@/lib/competitionCategories';

/**
 * The season table is shared by all six category pages, and three of them are
 * title contests decided in one night. Those rendered `Episodes` and
 * `Miss Congeniality` as columns of nothing but em dashes.
 *
 * The columns are now derived from the DATA, so what has to hold is:
 *   1. a column the category cannot populate is absent, and
 *   2. THE HEADER AND THE BODY AGREE.
 *
 * (2) is the one worth a test. Gating a header without gating its cell — or the
 * reverse — leaves the counts unequal, and every column after the gap silently
 * renders under the wrong heading. That is far worse than the empty column it
 * replaces, because nothing looks broken: a winner appears under
 * "Miss Congeniality" and reads as fact.
 */

function edition(over: Partial<CompetitionEdition> = {}): CompetitionEdition {
  return {
    slug: 'e1',
    number: 1,
    title: 'Edition 1',
    episode_count: null,
    episodes: 0,
    first_aired: '2020-01-01',
    last_aired: '2020-01-01',
    network: null,
    status: 'aired',
    host_city: null,
    host_country: null,
    entrants: 10,
    results: 0,
    winners: ['A Winner'],
    runners_up: [],
    miss_congeniality: [],
    ...over,
  };
}

function competition(kind: CompetitionKind, cat: CompetitionCategory, ed: CompetitionEdition) {
  return {
    slug: 'c1',
    name: 'A Competition',
    kind,
    category: cat,
    format: 'A format',
    network: null,
    organizer: 'An organizer',
    country: null,
    country_code: null,
    editions: [ed],
  } satisfies Competition;
}

/** Header cells vs body cells of the first row — they must match exactly. */
function columnCounts() {
  const headers = screen.getAllByRole('columnheader').length;
  const firstRow = screen.getAllByRole('row')[1];
  const cells = firstRow.querySelectorAll('td').length;
  return { headers, cells };
}

describe('CompetitionSeasonTable columns', () => {
  it('drops columns a title contest can never populate', () => {
    render(
      <CompetitionSeasonTable
        competitions={[
          // Shaped like the real corpus: 0 of 74 leather editions carry a date.
          competition('title', 'leather_title', edition({ first_aired: null, last_aired: null })),
        ]}
      />,
    );

    expect(screen.queryByText('Episodes'), 'a one-night contest has no episodes').toBeNull();
    expect(screen.queryByText('Miss Congeniality')).toBeNull();
    // Measured on prod: 0 of 74 leather editions and 0 of 99 drag pageant
    // editions carry a date at all.
    expect(screen.queryByText('First aired')).toBeNull();
    expect(screen.queryByText('Last aired')).toBeNull();

    const { headers, cells } = columnCounts();
    expect(cells, 'body must not drift from the header').toBe(headers);
  });

  it('keeps them where the data supports them', () => {
    // The positive control. Without it, "the column is absent" would also pass
    // on a table that renders no columns at all, or on a broken component.
    render(
      <CompetitionSeasonTable
        competitions={[
          competition(
            'series',
            'drag_series',
            edition({
              episode_count: 14,
              miss_congeniality: ['A Queen'],
              first_aired: '2020-01-01',
              last_aired: '2020-04-01',
            }),
          ),
        ]}
      />,
    );

    expect(screen.getByText('Episodes')).toBeTruthy();
    expect(screen.getByText('Miss Congeniality')).toBeTruthy();
    expect(screen.getByText('A Queen')).toBeTruthy();
    expect(screen.getByText('First aired')).toBeTruthy();

    const { headers, cells } = columnCounts();
    expect(cells).toBe(headers);
  });

  it('shows a column when ANY row in the category has it', () => {
    // Derived from the data, not from a hardcoded category list: one edition
    // with episodes is enough to earn the column for the whole page, so a
    // partially-documented category is not silently stripped of it.
    render(
      <CompetitionSeasonTable
        competitions={[
          competition('series', 'drag_series', edition({ episode_count: null })),
          {
            ...competition('series', 'drag_series', edition({ episode_count: 8 })),
            slug: 'c2',
            name: 'Another Competition',
          },
        ]}
      />,
    );

    expect(screen.getByText('Episodes')).toBeTruthy();
    const { headers, cells } = columnCounts();
    expect(cells).toBe(headers);
  });
});

describe('CompetitionSeasonTable date columns', () => {
  it('drops "Last aired" when it only repeats "First aired"', () => {
    // A contest decided in one night ends the day it starts. Repeating the
    // same date under a second heading is noise, not information — and it is
    // the shape of every dated gay-title and trans-pageant edition on prod.
    render(
      <CompetitionSeasonTable
        competitions={[
          competition(
            'title',
            'gay_title',
            edition({ first_aired: '2019-05-04', last_aired: '2019-05-04' }),
          ),
        ]}
      />,
    );

    expect(screen.getByText('First aired'), 'the date itself is real').toBeTruthy();
    expect(screen.queryByText('Last aired')).toBeNull();

    const { headers, cells } = columnCounts();
    expect(cells).toBe(headers);
  });

  it('keeps it when any run actually spans days', () => {
    render(
      <CompetitionSeasonTable
        competitions={[
          competition(
            'title',
            'gay_title',
            edition({ first_aired: '2019-05-04', last_aired: '2019-05-11' }),
          ),
        ]}
      />,
    );

    expect(screen.getByText('Last aired')).toBeTruthy();
    const { headers, cells } = columnCounts();
    expect(cells).toBe(headers);
  });
});

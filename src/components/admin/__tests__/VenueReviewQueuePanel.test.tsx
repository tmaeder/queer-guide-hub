/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  counts: { category_pending: 0, nonvenue_pending: 0, no_signal: 0, unexamined: 0, other_total: 0 },
  lastKind: null as string | null,
  lastCity: null as string | null,
  categoryCalls: [] as unknown[],
  nonvenueCalls: [] as unknown[],
}));

vi.mock('@/hooks/useVenueReviewQueue', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/useVenueReviewQueue');
  return {
    ...actual,
    useVenueReviewCounts: () => ({ data: state.counts }),
    useVenueReviewCandidates: (kind: string, _limit?: number, city?: string) => {
      state.lastKind = kind;
      state.lastCity = city ?? null;
      return { data: state.rows, isLoading: false };
    },
    useDecideVenueCategory: () => ({
      mutate: (v: unknown) => state.categoryCalls.push(v),
      isPending: false,
    }),
    useDecideVenueNonvenue: () => ({
      mutate: (v: unknown) => state.nonvenueCalls.push(v),
      isPending: false,
    }),
  };
});

import { VenueReviewQueuePanel } from '../VenueReviewQueuePanel';

const candidate = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  name: 'Cine Hoyts',
  city: 'Santiago',
  country: 'CL',
  website: null,
  description: null,
  suggested: 'theater',
  confidence: 0.82,
  reason: null,
  source_tags: 'Movie Theater,Save,mixed',
  data_source: 'unknown',
  ...over,
});

beforeEach(() => {
  state.rows = [];
  state.lastCity = null;
  state.counts = {
    category_pending: 844,
    nonvenue_pending: 1319,
    no_signal: 2289,
    unexamined: 9865,
    other_total: 12998,
  };
  state.lastKind = null;
  state.categoryCalls = [];
  state.nonvenueCalls = [];
});

describe('VenueReviewQueuePanel', () => {
  it('shows the raw source tags — the evidence that makes a decision possible', () => {
    // The name alone ("Cine Hoyts") does not settle the row; "Movie Theater"
    // does. This column is why the queue is reviewable at a glance.
    state.rows = [candidate()];
    renderWithProviders(<VenueReviewQueuePanel />);
    expect(screen.getByText(/Movie Theater,Save,mixed/)).toBeTruthy();
  });

  it('applies the engine suggestion when no override is chosen', () => {
    state.rows = [candidate()];
    renderWithProviders(<VenueReviewQueuePanel />);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(state.categoryCalls).toEqual([{ venueId: 'v1', accept: true, category: null }]);
  });

  it('sends the reviewer’s override instead of the suggestion', () => {
    // The engine is often close but wrong; accept-or-nothing would discard what
    // the reviewer actually knows.
    state.rows = [candidate()];
    renderWithProviders(<VenueReviewQueuePanel />);
    fireEvent.change(screen.getByLabelText(/category for cine hoyts/i), {
      target: { value: 'cruising' },
    });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(state.categoryCalls).toEqual([{ venueId: 'v1', accept: true, category: 'cruising' }]);
  });

  it('rejects without writing a category', () => {
    state.rows = [candidate()];
    renderWithProviders(<VenueReviewQueuePanel />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(state.categoryCalls).toEqual([{ venueId: 'v1', accept: false }]);
  });

  it('offers only the engine’s own category vocabulary', () => {
    // A free-text category would invent a value no filter or facet knows about.
    state.rows = [candidate()];
    renderWithProviders(<VenueReviewQueuePanel />);
    const select = screen.getByLabelText(/category for cine hoyts/i) as HTMLSelectElement;
    // The empty value is the "use suggestion" sentinel, not a category.
    expect(select.options[0].value).toBe('');
    expect(select.options[0].textContent).toMatch(/use suggestion/i);

    const values = Array.from(select.options)
      .map((o) => o.value)
      .filter(Boolean);
    expect(values).toContain('bar');
    expect(values).toContain('sauna');
    // Every option is a category the classifier itself can write.
    expect(values).toEqual(expect.arrayContaining(['club', 'restaurant', 'theater', 'other']));
    expect(values.some((v) => /\s/.test(v))).toBe(false);
  });

  it('switches to the non-venue queue and asks a different question', () => {
    state.rows = [candidate({ reason: 'matches_city_name', suggested: null, confidence: null })];
    renderWithProviders(<VenueReviewQueuePanel />);
    fireEvent.click(screen.getByRole('button', { name: /non-venues/i }));
    expect(state.lastKind).toBe('nonvenue');
    expect(screen.getByText(/name is a city/i)).toBeTruthy();
    // Confirming archives; the opposite action asserts it IS a venue.
    fireEvent.click(screen.getByRole('button', { name: /not a venue/i }));
    expect(state.nonvenueCalls).toEqual([{ venueId: 'v1', confirm: true }]);
  });

  it('says the engine leaves undecidable rows alone, rather than showing nothing', () => {
    state.rows = [];
    renderWithProviders(<VenueReviewQueuePanel />);
    expect(screen.getByText(/rather than guessing/i)).toBeTruthy();
  });
});

describe('VenueReviewQueuePanel city filter', () => {
  it('passes the typed city down to the query, debounced', async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<VenueReviewQueuePanel />);
      expect(state.lastCity).toBe('');

      fireEvent.change(screen.getByLabelText('Filter review queue by city'), {
        target: { value: 'Zürich' },
      });

      // Still the old value: a per-keystroke refetch would run the SECURITY DEFINER
      // function once per character.
      expect(state.lastCity).toBe('');

      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(state.lastCity).toBe('Zürich');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says which city came up empty, so a filtered blank is not read as a drained queue', async () => {
    vi.useFakeTimers();
    try {
      state.rows = [];
      renderWithProviders(<VenueReviewQueuePanel />);
      fireEvent.change(screen.getByLabelText('Filter review queue by city'), {
        target: { value: 'Zürich' },
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByText(/Nothing waiting for “Zürich”/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

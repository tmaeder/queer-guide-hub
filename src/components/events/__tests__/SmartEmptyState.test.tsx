/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useSuggestionsMock } = vi.hoisted(() => ({ useSuggestionsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      const def = (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? k;
      return def;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/i18n/dateFnsLocale', () => ({ dateFnsLocaleFor: () => undefined }));
vi.mock('@/hooks/useEmptyStateSuggestions', () => ({ useEmptyStateSuggestions: useSuggestionsMock }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { SmartEmptyState } from '../SmartEmptyState';

const emptySuggestions = { sameCityDifferentDate: [], otherCitiesSameDate: [], fallback: [] };

beforeEach(() => useSuggestionsMock.mockReset());

describe('SmartEmptyState', () => {
  it('shows heading + view-all action when no suggestions', () => {
    useSuggestionsMock.mockReturnValue({ suggestions: emptySuggestions });
    const onClear = vi.fn();
    render(<SmartEmptyState hasActiveFilters onClearFilters={onClear} />);
    expect(screen.getByText(/No events match your filters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View all upcoming events/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows Drop city + Drop date buttons when provided', () => {
    useSuggestionsMock.mockReturnValue({ suggestions: emptySuggestions });
    const onCity = vi.fn();
    const onDate = vi.fn();
    render(
      <SmartEmptyState
        hasActiveFilters
        city="Berlin"
        dateRange={{ start: '2026-01-01', end: '2026-01-10' }}
        onClearFilters={vi.fn()}
        onClearCity={onCity}
        onClearDate={onDate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Drop "Berlin"/i }));
    fireEvent.click(screen.getByRole('button', { name: /Drop date filter/i }));
    expect(onCity).toHaveBeenCalled();
    expect(onDate).toHaveBeenCalled();
  });

  it('prefers same-city different-date when available', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: {
        sameCityDifferentDate: [{ id: 'e1', slug: 's1', title: 'In Berlin later', start_date: '2026-06-01', city: 'Berlin' }],
        otherCitiesSameDate: [],
        fallback: [],
      },
    });
    render(<SmartEmptyState hasActiveFilters city="Berlin" onClearFilters={vi.fn()} />);
    expect(screen.getByText('In Berlin later')).toBeInTheDocument();
    expect(screen.getByText(/Try in Berlin on other dates/i)).toBeInTheDocument();
  });

  it('falls back to other-cities when same-city empty', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: {
        sameCityDifferentDate: [],
        otherCitiesSameDate: [{ id: 'e2', slug: 's2', title: 'Hamburg event', start_date: '2026-06-01', city: 'Hamburg' }],
        fallback: [],
      },
    });
    render(<SmartEmptyState hasActiveFilters onClearFilters={vi.fn()} />);
    expect(screen.getByText('Hamburg event')).toBeInTheDocument();
    expect(screen.getByText(/Try other cities/i)).toBeInTheDocument();
  });

  it('falls back to generic upcoming list', () => {
    useSuggestionsMock.mockReturnValue({
      suggestions: {
        sameCityDifferentDate: [],
        otherCitiesSameDate: [],
        fallback: [{ id: 'e3', slug: 's3', title: 'Something later', start_date: '2026-06-01', city: null }],
      },
    });
    render(<SmartEmptyState hasActiveFilters onClearFilters={vi.fn()} />);
    expect(screen.getByText('Something later')).toBeInTheDocument();
    expect(screen.getByText(/Other upcoming events/i)).toBeInTheDocument();
  });
});

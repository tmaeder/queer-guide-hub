/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

import { DiscoverFilters, DEFAULT_FILTERS, filtersAreEmpty } from '../DiscoverFilters';

describe('filtersAreEmpty', () => {
  it('returns true for DEFAULT_FILTERS', () => {
    expect(filtersAreEmpty(DEFAULT_FILTERS)).toBe(true);
  });

  it('returns false when any filter changed', () => {
    expect(filtersAreEmpty({ ...DEFAULT_FILTERS, travelerType: 'solo' })).toBe(false);
    expect(filtersAreEmpty({ ...DEFAULT_FILTERS, duration: 'week' })).toBe(false);
    expect(filtersAreEmpty({ ...DEFAULT_FILTERS, minEqualityScore: 50 })).toBe(false);
    expect(filtersAreEmpty({ ...DEFAULT_FILTERS, hasCover: true })).toBe(false);
    expect(filtersAreEmpty({ ...DEFAULT_FILTERS, hasOwnerProfile: true })).toBe(false);
  });
});

describe('DiscoverFilters', () => {
  it('renders trigger button with active count badge', () => {
    render(<DiscoverFilters value={{ ...DEFAULT_FILTERS, travelerType: 'solo', hasCover: true }} onChange={vi.fn()} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides count badge when no filters active', () => {
    render(<DiscoverFilters value={DEFAULT_FILTERS} onChange={vi.fn()} />);
    expect(screen.queryByText(/^[1-9]$/)).toBeNull();
  });
});

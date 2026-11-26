/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string, o?: Record<string, unknown>) =>
      (d ?? _k).replace(/\{\{(\w+)\}\}/g, (_, k) => String(o?.[k] ?? '')),
  }),
}));
vi.mock('@/hooks/useSearch', () => ({
  useSearch: (q: string) => ({ facets: undefined, totalHits: q ? 1234 : 0, loading: false }),
}));
// The panel has its own spec; here it only reports which sections it was given.
vi.mock('@/components/search/SearchFiltersPanel', () => ({
  SearchFiltersPanel: ({
    filterKeys,
    onFiltersChange,
  }: {
    filterKeys: string[];
    onFiltersChange: (f: object) => void;
  }) => (
    <div data-testid="panel" data-keys={filterKeys.join(',')}>
      <button onClick={() => onFiltersChange({ free: true })}>set free</button>
    </div>
  ),
}));

import { SearchPopoverFilters } from '../SearchPopoverFilters';
import { countActiveFilters } from '@/lib/searchFilterCount';

describe('SearchPopoverFilters', () => {
  it('opens the panel with date, location, price, free and audience for All', async () => {
    render(
      <SearchPopoverFilters
        query="bar"
        scope={null}
        filters={{}}
        onFiltersChange={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('panel')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(screen.getByTestId('panel')).toHaveAttribute(
      'data-keys',
      'date,geo,price,free,targetGroups',
    );
  });

  it('shows the active count and applies with the live result count', async () => {
    const onApply = vi.fn();
    render(
      <SearchPopoverFilters
        query="bar"
        scope="event"
        filters={{ free: true, tags: ['leather', 'bear'] }}
        onFiltersChange={vi.fn()}
        onApply={onApply}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /filters, 3 active/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Show 1,234 results' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('counts each advanced filter, not the scope', () => {
    expect(countActiveFilters({ types: ['event'] })).toBe(0);
    expect(
      countActiveFilters({
        dateRange: [new Date(), new Date()],
        location: 'Berlin',
        tags: ['a', 'b'],
      }),
    ).toBe(4);
  });
});

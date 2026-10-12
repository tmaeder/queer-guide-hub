/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchPopoverResults } from '../SearchPopoverResults';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      const text = String(fallback?.defaultValue ?? key);
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(fallback?.[name] ?? ''));
    },
  }),
}));

function setup(overrides = {}) {
  const onSearchAll = vi.fn();
  render(
    <SearchPopoverResults
      query="Berlin"
      activeScope={null}
      suggestions={[
        {
          id: '1',
          type: 'venue',
          name: 'Test venue',
          icon: () => null,
          subtitle: 'Berlin',
          city: 'Berlin',
          country: 'DE',
        },
      ]}
      countsByType={{ venue: 3 }}
      loading={false}
      error={null}
      focusedIndex={null}
      onSelect={vi.fn()}
      onHover={vi.fn()}
      onPrefetch={vi.fn()}
      onToggleFilters={vi.fn()}
      filtersOpen={false}
      activeFiltersCount={0}
      onSearchAll={onSearchAll}
      onClearScope={vi.fn()}
      onAsk={vi.fn()}
      {...overrides}
    />,
  );
  return onSearchAll;
}

describe('SearchPopoverResults', () => {
  it('labels the search-results action correctly and invokes it', () => {
    const onSearchAll = setup();
    fireEvent.click(screen.getByRole('button', { name: 'See all 3 →' }));
    expect(onSearchAll).toHaveBeenCalledOnce();
    expect(screen.queryByText(/on the map/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask the guide' })).toBeInTheDocument();
  });

  it('does not repeat the city in result metadata', () => {
    setup();
    expect(screen.getByText('Berlin · DE')).toBeInTheDocument();
    expect(screen.queryByText('Berlin · Berlin · DE')).toBeNull();
  });

  it('offers recovery instead of claiming no matches on request failure', () => {
    setup({ error: 'Network unavailable', suggestions: [], countsByType: {} });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/No station/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows searching instead of a misleading zero-result count while loading', () => {
    setup({ loading: true, suggestions: [], countsByType: {} });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText(/0 results/)).toBeNull();
  });
});

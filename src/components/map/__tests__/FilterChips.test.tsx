import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilterChips, buildFilterChips } from '@/components/map/FilterChips';

describe('FilterChips', () => {
  it('returns null when no filters are active', () => {
    const { container } = render(<FilterChips filters={{}} onRemove={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip for each active filter', () => {
    render(
      <FilterChips
        filters={{
          search: 'berlin',
          category: 'bar',
          tags: ['lesbian', 'trans'],
          nearMe: { lat: 52.52, lng: 13.41, radiusKm: 5 },
          queerOwned: true,
        }}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText('"berlin"')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
    expect(screen.getByText('2 tags')).toBeInTheDocument();
    expect(screen.getByText('Within 5 km')).toBeInTheDocument();
    expect(screen.getByText('Queer-owned')).toBeInTheDocument();
  });

  it('calls onRemove with the filter key when a chip is clicked', () => {
    const onRemove = vi.fn();
    render(<FilterChips filters={{ search: 'berlin' }} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove filter:/i }));
    expect(onRemove).toHaveBeenCalledWith('search');
  });

  it('shows a single tag value when only one tag is present', () => {
    render(<FilterChips filters={{ tags: ['lesbian'] }} onRemove={() => {}} />);
    expect(screen.getByText('lesbian')).toBeInTheDocument();
  });
});

describe('buildFilterChips', () => {
  it('returns one chip per active filter, in stable order', () => {
    const chips = buildFilterChips({
      search: 'x',
      category: 'bar',
      tags: ['a'],
      nearMe: { lat: 0, lng: 0, radiusKm: 1 },
      dateRange: { start: '2026-01-01', end: '2026-12-31' },
      accessible: true,
      queerOwned: true,
      era: { decadeStart: 1970, decadeEnd: 2020 },
    });
    expect(chips.map((c) => c.key)).toEqual([
      'search',
      'category',
      'tags',
      'nearMe',
      'dateRange',
      'accessible',
      'queerOwned',
      'era',
    ]);
  });

  it('omits keys with falsy or empty values', () => {
    const chips = buildFilterChips({ tags: [], search: '' });
    expect(chips).toEqual([]);
  });
});

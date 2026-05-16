/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TriageFilterBar } from '../TriageFilterBar';

const baseFilters = {
  queueTypes: null,
  search: '',
  sort: 'priority' as const,
  page: 1,
} as never;

const counts = {
  staging: 3, moderation: 1, submissions: 0, cmsReview: 2,
  automation: 5, tagSuggestions: 0, duplicates: 0,
} as never;

describe('TriageFilterBar', () => {
  it('renders one chip per queue', () => {
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={vi.fn()} />);
    ['Staging', 'Reports', 'Submissions', 'CMS', 'Auto', 'Tags', 'Dedup'].forEach(l => {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    });
  });

  it('shows count badge when count > 0', () => {
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('toggling a chip calls onFiltersChange with queueTypes', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Staging/ }));
    expect(onChange).toHaveBeenCalledWith({ queueTypes: ['staging'], page: 1 });
  });

  it('Enter in search input fires onFiltersChange with search + page reset', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ search: 'foo', page: 1 });
  });
});

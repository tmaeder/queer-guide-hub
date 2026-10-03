/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ADMIN_QUEUES } from '@/config/adminQueues';
import { TriageFilterBar } from '../TriageFilterBar';
import { buildInboxQueueChips } from '../triageQueueFilters';
import type { TriageFilters } from '@/hooks/useUnifiedTriageQueue';

const baseFilters: TriageFilters = {
  queueTypes: null,
  contentTypes: null,
  search: '',
  sort: 'priority' as const,
  page: 1,
  perPage: 50,
};

const counts = {
  review_staging: 3,
  review_moderation: 1,
  review_cms: 2,
  review_automation: 5,
  quality_city: 4,
  review_moderation_overdue: 1,
} as never;

describe('TriageFilterBar', () => {
  it('renders one chip per queue', () => {
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={vi.fn()} />);
    ['Staging', 'Reports', 'Submissions', 'CMS review', 'Automation', 'Quality'].forEach((label) =>
      expect(screen.getByRole('button', { name: new RegExp(label) })).not.toBeNull(),
    );
  });

  it('derives every inbox queue from the central registry', () => {
    const represented = new Set(buildInboxQueueChips(counts).flatMap((chip) => chip.keys));
    const expected = ADMIN_QUEUES.filter(
      (queue) => queue.queueKey && queue.route.startsWith('/admin/governance?mode=triage'),
    ).map((queue) => queue.queueKey);
    expect(represented).toEqual(new Set(expected));
  });

  it('shows count badge when count > 0', () => {
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={vi.fn()} />);
    expect(screen.getByText('3')).not.toBeNull();
    expect(screen.getByText('5')).not.toBeNull();
  });

  it('scopes to queues with breached SLAs', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(onChange).toHaveBeenCalledWith({ queueTypes: ['moderation'], page: 1 });
  });

  it('does not expose an unavailable quick scope as selected', () => {
    render(
      <TriageFilterBar filters={baseFilters} counts={{} as never} onFiltersChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('scopes to safety queues from registry metadata', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety' }));
    const change = onChange.mock.calls[0][0] as { queueTypes: string[]; page: number };
    expect(change.queueTypes).toContain('moderation');
    expect(change.queueTypes).toContain('quality-personality');
    expect(change.page).toBe(1);
  });

  it('toggling a chip calls onFiltersChange with queueTypes', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Staging/ }));
    expect(onChange).toHaveBeenCalledWith({ queueTypes: ['staging'], page: 1 });
  });

  it('offers an explicit all-queues reset and exposes its pressed state', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    const all = screen.getByRole('button', { name: 'All queues' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(all);
    expect(onChange).toHaveBeenCalledWith({ queueTypes: null, page: 1 });
  });

  it('exposes active queue chips as pressed controls', () => {
    render(
      <TriageFilterBar
        filters={{ ...baseFilters, queueTypes: ['staging'] }}
        counts={counts}
        onFiltersChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Staging/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All queues' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('Enter in search input fires onFiltersChange with search + page reset', () => {
    const onChange = vi.fn();
    render(<TriageFilterBar filters={baseFilters} counts={counts} onFiltersChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Search review queue' });
    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ search: 'foo', page: 1 });
  });
});

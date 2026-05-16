/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunHistoryTable } from '../RunHistoryTable';

const modules = [{ id: 'm1', display_name: 'Auto-Tagger' }] as never;

const runs = [
  {
    id: 'r1',
    module_id: 'm1',
    content_type: 'venues',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    items_scanned: 100,
    changes_proposed: 5,
    changes_auto_approved: 3,
    changes_pending_review: 2,
    errors: 0,
    duration_ms: 1234,
  },
  {
    id: 'r2',
    module_id: 'm1',
    content_type: null,
    created_at: new Date().toISOString(),
    items_scanned: 50,
    changes_proposed: 0,
    changes_auto_approved: 0,
    changes_pending_review: 0,
    errors: 4,
    duration_ms: 600_000,
  },
] as never;

describe('RunHistoryTable', () => {
  it('shows empty state', () => {
    render(<RunHistoryTable runs={[]} modules={modules} />);
    expect(screen.getByText(/No run history yet/i)).toBeInTheDocument();
  });

  it('renders one row per run with module label', () => {
    render(<RunHistoryTable runs={runs} modules={modules} />);
    expect(screen.getAllByText('Auto-Tagger')).toHaveLength(2);
  });

  it('renders error badge when errors > 0', () => {
    render(<RunHistoryTable runs={runs} modules={modules} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('formats duration', () => {
    render(<RunHistoryTable runs={runs} modules={modules} />);
    expect(screen.getByText('1.2s')).toBeInTheDocument();
    expect(screen.getByText('10.0m')).toBeInTheDocument();
  });
});

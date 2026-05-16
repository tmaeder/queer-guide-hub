/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../FeedbackCard', () => ({
  FeedbackCard: (p: { item: { id: string; title?: string } }) => <div data-testid="card">{p.item.title}</div>,
}));
vi.mock('../constants', () => ({
  kanbanColumns: [
    { id: 'new', label: 'New', color: '#000' },
    { id: 'under_review', label: 'Review', color: '#000' },
    { id: 'planned', label: 'Planned', color: '#000' },
    { id: 'in_progress', label: 'WIP', color: '#000' },
    { id: 'done', label: 'Done', color: '#000' },
  ],
}));

import { FeedbackKanban } from '../FeedbackKanban';

const emptyGrouped = { new: [], under_review: [], planned: [], in_progress: [], done: [] } as never;

describe('FeedbackKanban', () => {
  it('renders all 5 columns', () => {
    render(<FeedbackKanban
      grouped={emptyGrouped}
      voteCounts={{}} selectedIds={new Set()} focusedId={null}
      watchersByItem={{}} adminById={{}}
      isNew={() => false} onCardClick={vi.fn()}
      onToggleSelect={vi.fn()} onStatusDrop={vi.fn()}
    />);
    ['New', 'Review', 'Planned', 'WIP', 'Done'].forEach(l => {
      expect(screen.getByText(l)).toBeInTheDocument();
    });
  });

  it('shows empty messages per column', () => {
    render(<FeedbackKanban
      grouped={emptyGrouped}
      voteCounts={{}} selectedIds={new Set()} focusedId={null}
      watchersByItem={{}} adminById={{}}
      isNew={() => false} onCardClick={vi.fn()}
      onToggleSelect={vi.fn()} onStatusDrop={vi.fn()}
    />);
    expect(screen.getByText(/Nothing new to triage/)).toBeInTheDocument();
  });

  it('renders cards per status group', () => {
    render(<FeedbackKanban
      grouped={{
        ...emptyGrouped,
        new: [{ id: 'f1', title: 'Bug 1' }, { id: 'f2', title: 'Bug 2' }],
      } as never}
      voteCounts={{}} selectedIds={new Set()} focusedId={null}
      watchersByItem={{}} adminById={{}}
      isNew={() => false} onCardClick={vi.fn()}
      onToggleSelect={vi.fn()} onStatusDrop={vi.fn()}
    />);
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });
});

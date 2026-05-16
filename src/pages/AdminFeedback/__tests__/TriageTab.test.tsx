/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';

vi.mock('@/components/admin/feedback/FeedbackKanban', () => ({ FeedbackKanban: () => <div>kanban</div> }));
vi.mock('@/components/admin/feedback/FeedbackFilters', () => ({ FeedbackFilters: () => null }));
vi.mock('@/components/admin/feedback/FeedbackPresets', () => ({ FeedbackPresets: () => null }));
vi.mock('@/components/admin/feedback/FeedbackBulkBar', () => ({ FeedbackBulkBar: () => null }));

import { TriageTab } from '../TriageTab';

const emptyGrouped = { open: [], triaged: [], in_progress: [], blocked: [], done: [], wont_fix: [] } as never;

describe('TriageTab', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TriageTab
        state={{} as never} update={vi.fn()} clearFilters={vi.fn()} activeFilterCount={0}
        currentUserId="u1" admins={[]} availableLabels={[]} searchInputRef={createRef() as never}
        grouped={emptyGrouped} totalVisibleCount={0} voteCounts={{}}
        selectedIds={new Set()} focusedId={null} watchersByItem={{}} adminMap={{}}
        submissionStoryMap={{}} sessionStartIso="" seenIds={new Set()}
        setSeenIds={vi.fn()} setFocusedId={vi.fn()} setFocusedColumnIdx={vi.fn()}
        toggleSelect={vi.fn()} selectAllVisible={vi.fn()} clearSelection={vi.fn()}
        items={[]} stories={[]}
        onSetStatus={vi.fn()} onSetPriority={vi.fn()} onAssign={vi.fn()} onSetLabels={vi.fn()}
        onForward={vi.fn()} onCreateStoryFromSelection={vi.fn()} onAddSelectionToStory={vi.fn()}
        onAutoTitle={vi.fn().mockResolvedValue(null)} mutationsLoading={false}
      />,
    );
    expect(container).toBeTruthy();
  });
});

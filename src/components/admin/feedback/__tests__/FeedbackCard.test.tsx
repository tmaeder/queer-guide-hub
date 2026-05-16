/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '1h ago' }));
vi.mock('../constants', () => ({ priorityFor: () => ({ short: 'P1', color: '#000', label: 'High' }) }));
vi.mock('@/hooks/useFeedbackHandoff', () => ({ latestHandoff: () => null }));

import { FeedbackCard } from '../FeedbackCard';

const item = {
  id: 'f1', data: { category: 'idea' }, priority: 'P2', status: 'open',
  created_at: '2026-05-15T00:00:00Z', github_issue_url: null,
} as never;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <DndContext>
        <SortableContext items={['f1']}>{children}</SortableContext>
      </DndContext>
    </TooltipProvider>
  );
}

describe('FeedbackCard', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FeedbackCard item={item} voteCount={0} selected={false} focused={false} watchers={[]} assignee={null} story={null} onStoryClick={vi.fn()} onClick={vi.fn()} onToggleSelect={vi.fn()} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});

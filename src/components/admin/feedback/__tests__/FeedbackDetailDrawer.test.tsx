/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../constants', () => ({
  priorityFor: () => ({ short: 'P2', color: '#000', label: 'Med' }),
}));
vi.mock('../claudePrompts', () => ({ formatClaudePrompt: () => '' }));
vi.mock('@/config/feedbackCategories', () => ({ feedbackCategoryMap: { idea: { icon: () => null, label: 'Idea' } } }));

import { FeedbackDetailDrawer } from '../FeedbackDetailDrawer';

describe('FeedbackDetailDrawer', () => {
  it('renders closed without crashing', () => {
    const { container } = render(
      <FeedbackDetailDrawer
        open={false} item={null} voteCount={0} admins={[]} availableLabels={[]} watchers={[]}
        isForwarding={false} duplicateSuggestions={[]} itemsById={{}} canonical={null}
        onOpenPartner={vi.fn()} onMergeDuplicate={vi.fn()} onDismissDuplicate={vi.fn()}
        onToggleSpam={vi.fn()} onToggleNotify={vi.fn()} auditEntries={[]} adminById={{}}
        onSendReply={vi.fn()} isSendingReply={false} onResolutionChange={vi.fn()} onClose={vi.fn()}
        onStatusChange={vi.fn()} onPriorityChange={vi.fn()} onAssign={vi.fn()}
        onAddLabel={vi.fn()} onRemoveLabel={vi.fn()} onSaveNotes={vi.fn()}
        onForward={vi.fn()} onCopyPrompt={vi.fn()} onRecordHandoff={vi.fn()}
        onUpdateHandoff={vi.fn()} isRecordingHandoff={false}
      />,
    );
    expect(container).toBeTruthy();
  });
});

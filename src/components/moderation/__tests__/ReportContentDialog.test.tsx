/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useReportContent', () => ({
  useReportContent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useUserRelationships', () => ({
  useUserRelationships: () => ({ blockUser: vi.fn() }),
}));

import { ReportContentDialog } from '../ReportContentDialog';

const renderDialog = (targetUserId?: string | null) =>
  render(
    React.createElement(ReportContentDialog, {
      open: true,
      onOpenChange: () => {},
      contentType: 'community_post',
      contentId: 'post-1',
      targetUserId,
    }),
  );

describe('ReportContentDialog', () => {
  it('disables submit until a reason is chosen', () => {
    renderDialog('author-1');
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
  });

  it('offers the "also block" action only when the author is known', () => {
    renderDialog('author-1');
    expect(screen.getByText('Also block this person')).toBeInTheDocument();
  });

  it('hides the block action when there is no target user', () => {
    renderDialog(null);
    expect(screen.queryByText('Also block this person')).not.toBeInTheDocument();
  });
});

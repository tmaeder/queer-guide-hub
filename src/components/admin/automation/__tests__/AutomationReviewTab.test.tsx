/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useAutomationMock, queueSpy, dialogSpy } = vi.hoisted(() => ({
  useAutomationMock: vi.fn(),
  queueSpy: vi.fn(),
  dialogSpy: vi.fn(),
}));

vi.mock('@/hooks/useAutomation', () => ({ useAutomation: useAutomationMock }));
vi.mock('../ReviewQueue', () => ({
  ReviewQueue: (p: unknown) => { queueSpy(p); return <div data-testid="queue" />; },
}));
vi.mock('../ChangeDetailDialog', () => ({
  ChangeDetailDialog: (p: { open: boolean }) => { dialogSpy(p); return p.open ? <div data-testid="dialog" /> : null; },
}));

import { AutomationReviewTab } from '../AutomationReviewTab';

beforeEach(() => {
  useAutomationMock.mockReset();
  queueSpy.mockReset();
  dialogSpy.mockReset();
  useAutomationMock.mockReturnValue({
    pendingChanges: [{ id: 'c1' }],
    approveChange: vi.fn(),
    rejectChange: vi.fn(),
    bulkApprove: vi.fn(),
    bulkReject: vi.fn(),
    revertChange: vi.fn(),
    isApproving: false,
    isRejecting: false,
  });
});

describe('AutomationReviewTab', () => {
  it('passes pendingChanges + handlers to ReviewQueue', () => {
    render(<AutomationReviewTab />);
    expect(screen.getByTestId('queue')).toBeInTheDocument();
    const queueProps = queueSpy.mock.calls[0][0];
    expect(queueProps.changes).toEqual([{ id: 'c1' }]);
    expect(typeof queueProps.onApprove).toBe('function');
    expect(typeof queueProps.onBulkApprove).toBe('function');
  });

  it('initially renders dialog closed', () => {
    render(<AutomationReviewTab />);
    expect(screen.queryByTestId('dialog')).toBeNull();
  });
});

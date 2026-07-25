/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DedupReviewQueue } from '../DedupReviewQueue';
import type { DedupReviewRow } from '@/hooks/useDedupReview';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const decideMutateAsync = vi.fn().mockResolvedValue(undefined);
const batchMutateAsync = vi.fn().mockResolvedValue(2);
let mockRows: DedupReviewRow[] = [];

vi.mock('@/hooks/useDedupReview', () => ({
  useDedupReviewQueue: () => ({
    data: mockRows,
    isLoading: false,
    decide: { mutateAsync: decideMutateAsync },
    batchApproveSafe: { mutateAsync: batchMutateAsync },
  }),
  useDedupPendingCount: () => ({ data: 0 }),
}));

const row = (over: Partial<DedupReviewRow> = {}): DedupReviewRow => ({
  id: 'r1',
  entity_type: 'venue',
  keep_id: 'k1',
  drop_id: 'd1',
  cluster: {
    keep: { id: 'k1', title: 'Laboratory' },
    drop: { id: 'd1', title: 'Lab.Oratory' },
    match_type: 'despace_no_geo',
    distance_m: null,
  },
  confidence: 0.85,
  reason: 'despace_no_geo',
  created_at: '2026-07-25T00:00:00Z',
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
  mockRows = [];
});

describe('DedupReviewQueue', () => {
  it('renders both members and the reason badge', () => {
    mockRows = [row()];
    render(<DedupReviewQueue entityType="venue" />);
    expect(screen.getByText('Laboratory')).toBeTruthy();
    expect(screen.getByText('Lab.Oratory')).toBeTruthy();
    expect(screen.getByText('despace_no_geo')).toBeTruthy();
  });

  it('approves without confirm for non-personality rows', async () => {
    mockRows = [row()];
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<DedupReviewQueue entityType="venue" />);
    fireEvent.click(screen.getByRole('button', { name: /^Merge$/ }));
    await waitFor(() =>
      expect(decideMutateAsync).toHaveBeenCalledWith({ id: 'r1', action: 'approve', keepId: undefined }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('confirm-gates personality merges (namesake risk)', async () => {
    mockRows = [row({ entity_type: 'personality', reason: 'despace_namesake', confidence: 0.75 })];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DedupReviewQueue />);
    fireEvent.click(screen.getByRole('button', { name: /^Merge$/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(decideMutateAsync).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('passes the swapped canonical as keepId', async () => {
    mockRows = [row()];
    render(<DedupReviewQueue entityType="venue" />);
    fireEvent.click(screen.getByRole('button', { name: /Lab\.Oratory/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Merge$/ }));
    await waitFor(() =>
      expect(decideMutateAsync).toHaveBeenCalledWith({ id: 'r1', action: 'approve', keepId: 'd1' }),
    );
  });

  it('excludes personalities from the batch-safe count', () => {
    mockRows = [
      row({ id: 'a', confidence: 0.97 }),
      row({ id: 'b', entity_type: 'personality', confidence: 0.97 }),
      row({ id: 'c', confidence: 0.9 }),
    ];
    render(<DedupReviewQueue />);
    expect(screen.getByRole('button', { name: /Merge safe \(1\)/ })).toBeTruthy();
  });
});

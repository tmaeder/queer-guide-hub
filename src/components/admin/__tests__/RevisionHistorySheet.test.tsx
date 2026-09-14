/**
 * @vitest-environment jsdom
 *
 * The refusals are the reason revert is safe to offer, so they have to reach
 * the reader. A revert that silently declines to write a field is
 * indistinguishable from one that worked — which is the failure mode this
 * whole feature exists to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { loadMock, revertMock, toastSpies, revisionsRef } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  revertMock: vi.fn(),
  revisionsRef: { current: [] as unknown[] },
  toastSpies: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: toastSpies }));
vi.mock('@/hooks/useContentRevisions', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useContentRevisions')>(
    '@/hooks/useContentRevisions',
  );
  return {
    ...actual,
    useContentRevisions: () => ({
      revisions: revisionsRef.current,
      loading: false,
      error: null,
      load: loadMock,
      revertFields: revertMock,
    }),
  };
});

import { RevisionHistorySheet } from '../RevisionHistorySheet';

const machineUpdate = {
  id: 'rev-1',
  seq: 2,
  source_table: 'venues',
  source_id: 'v1',
  op: 'U' as const,
  before: { description: 'old text', phone: '111' },
  after: { description: 'new text', phone: '222' },
  changed_fields: ['description', 'phone'],
  actor_kind: 'system' as const,
  actor_id: null,
  actor: null,
  created_at: '2026-09-01T10:00:00Z',
};

const creation = { ...machineUpdate, id: 'rev-0', seq: 1, op: 'I' as const, before: {} };

const renderSheet = (onReverted = vi.fn()) =>
  render(
    <RevisionHistorySheet
      open
      onOpenChange={vi.fn()}
      contentType="venues"
      contentId="v1"
      contentName="Some Bar"
      onReverted={onReverted}
    />,
  );

beforeEach(() => {
  loadMock.mockReset();
  revertMock.mockReset();
  Object.values(toastSpies).forEach((s) => s.mockReset());
  revisionsRef.current = [machineUpdate];
});

describe('RevisionHistorySheet', () => {
  it('loads the trail for the record when opened', () => {
    renderSheet();
    expect(loadMock).toHaveBeenCalledWith('venues', 'v1');
  });

  it('labels a machine write as automated rather than as a person', () => {
    renderSheet();
    expect(screen.getByText('Automated')).toBeInTheDocument();
  });

  it('names a declared script actor', () => {
    revisionsRef.current = [{ ...machineUpdate, actor_kind: 'declared', actor: 'migration:foo' }];
    renderSheet();
    expect(screen.getByText('migration:foo')).toBeInTheDocument();
  });

  it('reverts every changed field and tells the page to refetch', async () => {
    revertMock.mockResolvedValue({ reverted: ['description', 'phone'], skipped: [] });
    const onReverted = vi.fn();
    renderSheet(onReverted);
    fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Revert all 2 field/ }));
    await waitFor(() => expect(revertMock).toHaveBeenCalledWith('rev-1', ['description', 'phone']));
    await waitFor(() => expect(onReverted).toHaveBeenCalled());
    expect(toastSpies.success).toHaveBeenCalled();
  });

  it('reverts one field on its own', async () => {
    revertMock.mockResolvedValue({ reverted: ['phone'], skipped: [] });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^phone$/ }));
    await waitFor(() => expect(revertMock).toHaveBeenCalledWith('rev-1', ['phone']));
  });

  it('SURFACES a refusal — a field that moved on is reported, not swallowed', async () => {
    revertMock.mockResolvedValue({
      reverted: ['phone'],
      skipped: [{ field: 'description', reason: 'value_moved_on' }],
    });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Revert all 2 field/ }));
    await waitFor(() => expect(toastSpies.warning).toHaveBeenCalled());
    expect(String(toastSpies.warning.mock.calls[0][0])).toMatch(/description/);
    expect(String(toastSpies.warning.mock.calls[0][0])).toMatch(/changed since/);
  });

  it('reports a failed revert instead of appearing to succeed', async () => {
    revertMock.mockRejectedValue(new Error('unauthorized'));
    const onReverted = vi.fn();
    renderSheet(onReverted);
    fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Revert all 2 field/ }));
    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled());
    expect(onReverted).not.toHaveBeenCalled();
  });

  it('offers no revert on a create — there is no previous state to go back to', async () => {
    revisionsRef.current = [creation];
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Created/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Revert/ })).toBeNull());
  });

  it('drops the per-field buttons when a write touched many columns', async () => {
    // A bulk backfill can change a dozen columns at once; a wall of buttons is
    // not a choice, it is a search problem. "Revert all" still stands.
    const wide = Array.from({ length: 12 }, (_, i) => `col_${i}`);
    revisionsRef.current = [
      {
        ...machineUpdate,
        changed_fields: wide,
        before: Object.fromEntries(wide.map((f) => [f, 'a'])),
        after: Object.fromEntries(wide.map((f) => [f, 'b'])),
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Updated/ }));
    expect(await screen.findByRole('button', { name: /Revert all 12 field/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^col_0$/ })).toBeNull();
  });
});

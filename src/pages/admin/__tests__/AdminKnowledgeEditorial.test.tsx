import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, it, expect, vi } from 'vitest';
const { useQueue } = vi.hoisted(() => ({ useQueue: vi.fn() }));
vi.mock('@/hooks/knowledge/useKnowledgeEditorial', () => ({
  useKnowledgeEditorial: useQueue,
  usePublicKnowledgeEditorial: () => ({ data: [] }),
}));
import AdminKnowledgeEditorial from '../AdminKnowledgeEditorial';
const entry = {
  id: 'entry-1',
  batch_id: 'batch-1',
  entity_type: 'unified_tags',
  entity_id: 'entity-1',
  name: 'Chosen Family',
  slug: 'chosen-family',
  pilot_group: 'relationships',
  reader_question: 'Who belongs in a chosen family?',
  format: 'explainer',
  source_urls: [],
  visual_ids: [],
};
const proposal = {
  id: 'proposal-1',
  entry_id: 'entry-1',
  base_hash: 'base',
  base_snapshot: { description: 'Original summary', long_description: 'Original body' },
  patch: {
    description: 'Draft summary',
    long_description: '<h2>Care and belonging</h2><p>Draft body.</p>',
  },
  sources: [],
  status: 'draft',
  checks: {},
  rubric: {},
  updated_at: '2026-11-27T18:00:00Z',
};
const mutate = vi.fn();
function show() {
  return render(
    <MemoryRouter initialEntries={['/admin/knowledge-editorial?entry=entry-1']}>
      <AdminKnowledgeEditorial />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockResolvedValue({ ok: true });
  useQueue.mockReturnValue({
    data: { entries: [entry], proposals: [proposal], batches: [], events: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    action: { mutateAsync: mutate, isPending: false },
    worker: { mutateAsync: vi.fn(), isPending: false },
  });
});
describe('knowledge review publication controls', () => {
  it('prevents publication of an unchecked draft', () => {
    show();
    expect(screen.getByRole('button', { name: 'Approve draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish approved draft' })).toBeDisabled();
  });
  it('requires saving edits before validation and retains the optimistic version', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Edited summary' } });
    expect(screen.getByRole('button', { name: 'Check evidence and writing' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'save',
          id: 'proposal-1',
          payload: expect.objectContaining({
            expected_updated_at: proposal.updated_at,
            patch: expect.objectContaining({ description: 'Edited summary' }),
          }),
        }),
      ),
    );
  });
  it('previews semantic HTML and strips script content', () => {
    useQueue.mockReturnValueOnce({
      ...useQueue(),
      data: {
        entries: [entry],
        proposals: [
          {
            ...proposal,
            patch: {
              ...proposal.patch,
              long_description:
                '<h2>Care and belonging</h2><script>window.BAD=true</script><p>Body</p>',
            },
          },
        ],
        batches: [],
        events: [],
      },
    });
    const { container } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Preview and compare' }));
    expect(screen.getByRole('heading', { name: 'Care and belonging' })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
  it('shows a failed publication without claiming success', async () => {
    mutate.mockRejectedValue(new Error('Live content changed; regenerate.'));
    useQueue.mockReturnValueOnce({
      ...useQueue(),
      data: {
        entries: [entry],
        proposals: [{ ...proposal, status: 'approved' }],
        batches: [],
        events: [],
      },
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Publish approved draft' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Live content changed; regenerate.',
    );
  });
});

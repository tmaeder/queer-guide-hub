import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), search: vi.fn(), createTag: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin' } }) }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: mocks.rpc, untypedFrom: vi.fn() }));
vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: mocks.search,
  createTagFromProposal: mocks.createTag,
}));
import { decideReview, type ReviewItem } from '../useAdminReview';
const item = (queue_type: string, meta: Record<string, unknown> = {}) =>
  ({ id: 'source-id', queue_type, entity_id: 'entity-id', meta }) as ReviewItem;
describe('review decision adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('uses the authenticated server dispatcher with the original source ID, not a UI selection key', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await decideReview({
      item: item('brand-ownership'),
      action: 'approve',
      confirm: true,
      notes: 'Public source',
      payload: { tags: ['queer_owned'] },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'admin_review_action',
      expect.objectContaining({
        p_item_id: 'source-id',
        p_confirm: true,
        p_notes: 'Public source',
        p_payload: { tags: ['queer_owned'] },
      }),
    );
  });
  it('routes selected venue matches to the transactional link applier', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await decideReview({
      item: {
        ...item('general-review', { review_type: 'venue_link_candidate' }),
        entity_table: 'events',
      },
      action: 'approve',
      payload: { venue_id: 'venue', expected_updated_at: 'timestamp' },
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'admin_review_link_event_venue',
      expect.objectContaining({
        p_venue_id: 'venue',
        p_expected_updated_at: 'timestamp',
        p_item_id: 'source-id',
      }),
    );
  });
  it('refuses a generic approval for venue matching without live comparison', async () => {
    await expect(
      decideReview({
        item: {
          ...item('event-quality', { issue_code: 'NAMED_VENUE_UNLINKED' }),
          entity_table: 'events',
        },
        action: 'approve',
      }),
    ).rejects.toThrow('Compare and select');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not treat an unsuccessful source response as approval', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: 'Source refused' }, error: null });
    await expect(decideReview({ item: item('venue-category'), action: 'approve' })).rejects.toThrow(
      'Source refused',
    );
  });
  it('leaves enrichment application failures visible and retryable', async () => {
    mocks.search.mockResolvedValue({
      success: true,
      data: { status: 'approved', review_notes: 'auto-apply failed: source unavailable' },
    });
    await expect(decideReview({ item: item('tag-enrichment'), action: 'approve' })).rejects.toThrow(
      'source unavailable',
    );
  });
  it('routes a successful tag enrichment through its existing applier', async () => {
    mocks.search.mockResolvedValue({ success: true, data: { status: 'applied' } });
    await decideReview({ item: item('tag-enrichment'), action: 'approve' });
    expect(mocks.search).toHaveBeenCalledWith(
      'suggestions/source-id',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.objectContaining({ status: 'approved' }),
      }),
    );
  });
  it('preserves the separate mint-and-mark-applied path for new tag proposals', async () => {
    mocks.createTag.mockResolvedValue({ success: true, data: { id: 'new-tag' } });
    mocks.search.mockResolvedValue({ success: true, data: { status: 'applied' } });
    await decideReview({
      item: {
        ...item('tag-enrichment', {
          suggestion_type: 'tag',
          proposed_value: { name: 'New concept' },
        }),
        entity_id: null,
      },
      action: 'approve',
    });
    expect(mocks.createTag).toHaveBeenCalledWith('New concept');
    expect(mocks.search).toHaveBeenCalledWith(
      'suggestions/source-id',
      expect.objectContaining({ body: expect.objectContaining({ status: 'applied' }) }),
    );
  });
});

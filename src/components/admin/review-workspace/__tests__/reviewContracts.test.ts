import { describe, expect, it } from 'vitest';
import { reviewContract, reviewKey } from '../reviewContracts';
import { reviewRedirectUrl } from '../reviewRedirects';
import type { ReviewItem } from '@/hooks/useAdminReview';
const item = (queue_type: string, meta: Record<string, unknown> = {}) =>
  ({ queue_type, id: 'same-id', meta }) as ReviewItem;
describe('unified review contracts', () => {
  it('keeps independent decisions for one entity independently selectable', () => {
    expect(reviewKey(item('venue-category'))).not.toBe(reviewKey(item('venue-kind')));
  });
  it('distinguishes keeping a sensitive tag hidden from rejecting its existence', () => {
    expect(reviewContract(item('sensitive-tags')).reject).toBe('Reviewed, keep hidden');
  });
  it('refuses acceptance of critical event issues but permits audited exceptions otherwise', () => {
    expect(reviewContract(item('event-quality', { severity: 'critical' })).rejectDisabled).toBe(
      true,
    );
    expect(reviewContract(item('event-quality', { severity: 'high' })).rejectNeedsNote).toBe(true);
  });
  it('keeps geography verification failures actionable rather than dismissable', () => {
    expect(reviewContract(item('geography')).rejectDisabled).toBe(true);
  });
  it('does not mislabel milestone duplicate classification as a merge', () => {
    expect(reviewContract(item('milestone-duplicates')).consequence).toContain('does not merge');
  });
  it('maps tag panel bookmarks to the relevant source', () => {
    expect(reviewRedirectUrl('?mode=tags&tagPanel=sensitive')).toBe('/admin?queue=sensitive-tags');
    expect(reviewRedirectUrl('?mode=tags&tagPanel=suggestions')).toBe(
      '/admin?queue=tag-enrichment',
    );
  });
  it('preserves the legacy inbox filter and selection', () => {
    expect(reviewRedirectUrl('?tab=staging&selected=abc', 'triage')).toBe(
      '/admin?selected=abc&queue=staging',
    );
  });
  it('maps the old engines home to the same queue', () => {
    expect(reviewRedirectUrl('?mode=engines')).toBe('/admin');
  });
  it('keeps taxonomy merges as tag merge decisions', () => {
    expect(reviewRedirectUrl('?family=taxonomy', 'merge')).toBe('/admin?queue=tag-merges');
  });
});

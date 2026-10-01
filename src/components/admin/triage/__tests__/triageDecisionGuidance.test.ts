import { describe, expect, it } from 'vitest';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';
import { getTriageDecisionGuidance } from '../triageDecisionGuidance';

function item(queueType: string, overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id: 'review-1',
    queue_type: queueType,
    content_type: 'venues',
    title: 'Example venue',
    subtitle: '',
    status: 'pending',
    confidence_score: 0.72,
    created_at: '2026-10-01T00:00:00Z',
    source: 'test',
    entity_id: null,
    entity_table: null,
    has_diff: false,
    reporter_id: null,
    meta: {},
    ...overrides,
  };
}

describe('getTriageDecisionGuidance', () => {
  it('makes the staging hand-off and delayed publication explicit', () => {
    const guidance = getTriageDecisionGuidance(item('staging'));
    expect(guidance.approveLabel).toBe('Approve & queue');
    expect(guidance.approve).toMatch(/commit pipeline/i);
    expect(guidance.approve).toMatch(/nothing becomes public until/i);
    expect(guidance.reject).toMatch(/no live content is changed/i);
  });

  it('states when approval publishes immediately', () => {
    const guidance = getTriageDecisionGuidance(item('content'));
    expect(guidance.approveLabel).toBe('Publish');
    expect(guidance.approve).toMatch(/publishes.*immediately/i);
    expect(guidance.reject).toMatch(/draft/i);
  });

  it('states when approval performs an irreversible merge', () => {
    const guidance = getTriageDecisionGuidance(item('dedup-review'));
    expect(guidance.approveLabel).toBe('Approve merge');
    expect(guidance.approve).toMatch(/cannot be fully undone/i);
    expect(guidance.reject).toMatch(/remain separate/i);
  });

  it('names saved corrections and blocks ambiguous unsaved ones', () => {
    const guidance = getTriageDecisionGuidance(item('staging'), {
      changedFields: ['name', 'opening_hours'],
      unsavedCount: 2,
    });
    expect(guidance.approve).toMatch(/Name, Opening Hours/);
    expect(guidance.unsavedWarning).toMatch(/2 unsaved corrections/i);
  });

  it('explains that skipping leaves the item pending', () => {
    const guidance = getTriageDecisionGuidance(item('quality-city'));
    expect(guidance.defer).toMatch(/leaves this item pending/i);
    expect(guidance.defer).toMatch(/no content or review status changes/i);
  });
});

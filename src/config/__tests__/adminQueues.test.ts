/**
 * Guards the shared queue registry against the two ways it can silently rot:
 * drifting away from the keys `get_admin_counts` actually emits, and losing the
 * ordering rule the cockpit feed depends on.
 *
 * EXPECTED_COUNT_KEYS is transcribed from the live `triage_sources` rows plus
 * the three static gates in the RPC body (migration
 * 20260801050000_p4_fold_quality_queues_into_triage.sql). This test cannot see
 * SQL, so a NEW migration adding a queue will not fail it — but any refactor
 * that drops, renames or duplicates an entry here will.
 */

import { describe, it, expect } from 'vitest';
import {
  ADMIN_QUEUES,
  QUALITY_GATES,
  queueByCountKey,
  rankQueueRows,
  summarizeQueues,
} from '@/config/adminQueues';
import type { AdminCounts } from '@/hooks/useAdminCounts';

const EXPECTED_COUNT_KEYS = [
  // 17 active triage_sources rows
  'review_moderation',
  'review_submissions',
  'review_staging',
  'review_cms',
  'quality_duplicates',
  'review_org_links',
  'quality_personality',
  'quality_city',
  'quality_venue',
  'quality_editorial',
  'review_news_quality',
  'quality_village',
  'review_tags',
  'quality_marketplace',
  'review_duplicates',
  'review_entity_links',
  'review_automation',
  // static gates computed outside the registry loop
  'review_feedback',
  'review_group_requests',
  'quality_existence',
];

/** The only two gates the RPC emits with no `<key>_overdue` companion. */
const NO_OVERDUE_KEYS = ['review_group_requests', 'quality_existence'];

describe('ADMIN_QUEUES', () => {
  it('covers exactly the keys get_admin_counts emits', () => {
    expect(new Set(ADMIN_QUEUES.map((q) => q.countKey))).toEqual(new Set(EXPECTED_COUNT_KEYS));
  });

  it('has unique count keys', () => {
    const keys = ADMIN_QUEUES.map((q) => q.countKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('marks exactly the two known static gates as having no overdue companion', () => {
    const without = ADMIN_QUEUES.filter((q) => !q.hasOverdue).map((q) => q.countKey);
    expect(new Set(without)).toEqual(new Set(NO_OVERDUE_KEYS));
  });

  it('routes registry queues to their own inbox queue unless reviewed inline', () => {
    for (const q of ADMIN_QUEUES) {
      if (!q.queueKey || q.section) continue;
      expect(q.route).toBe(`/admin/inbox?queue=${q.queueKey}`);
    }
  });

  it('never routes through the ?tab= vocabulary, which the quality queues do not map', () => {
    for (const q of ADMIN_QUEUES) expect(q.route).not.toContain('?tab=');
  });

  it('gives every queue with an SLA key an unprefixed slaKey', () => {
    // sla_hours is keyed by triage_sources.count_key, NOT by the emitted
    // count key — `staging`, not `review_staging`.
    for (const q of ADMIN_QUEUES) {
      if (!q.slaKey) continue;
      expect(q.slaKey.startsWith('review_')).toBe(false);
    }
  });

  it('exposes the nine quality-hub gates, all present in the registry', () => {
    expect(QUALITY_GATES).toHaveLength(9);
    for (const gate of QUALITY_GATES) {
      expect(queueByCountKey(gate.countKey)).toBe(gate);
      expect(gate.surfaces).toContain('quality');
    }
  });

  it('keeps review_duplicates and quality_duplicates as separate queues', () => {
    expect(queueByCountKey('review_duplicates')?.queueKey).toBe('duplicates');
    expect(queueByCountKey('quality_duplicates')?.queueKey).toBe('dedup-review');
  });
});

describe('rankQueueRows', () => {
  const counts = (extra: Record<string, unknown>) => extra as unknown as AdminCounts;

  it('returns nothing when counts have not loaded', () => {
    expect(rankQueueRows(undefined, 'admin')).toEqual([]);
  });

  it('drops queues with no pending work', () => {
    const rows = rankQueueRows(counts({ review_staging: 0, review_tags: 3 }), 'admin');
    expect(rows.map((r) => r.def.countKey)).toEqual(['review_tags']);
  });

  it('puts an overdue queue above a heavier, larger, on-time one', () => {
    const rows = rankQueueRows(
      counts({
        // Reports: highest weight (100), biggest count, but nothing overdue.
        review_moderation: 500,
        review_moderation_overdue: 0,
        // Automation: lowest weight (10), tiny — but late.
        review_automation: 1,
        review_automation_overdue: 1,
      }),
      'admin',
    );
    expect(rows.map((r) => r.def.countKey)).toEqual(['review_automation', 'review_moderation']);
  });

  it('is a total order — ties break alphabetically, so polls do not reshuffle', () => {
    // quality_village and review_news_quality both weigh 30.
    const payload = counts({ quality_village: 4, review_news_quality: 4 });
    const first = rankQueueRows(payload, 'admin').map((r) => r.def.label);
    const second = rankQueueRows(payload, 'admin').map((r) => r.def.label);
    expect(first).toEqual(second);
    expect(first).toEqual(['News quality', 'Village quality']);
  });

  it('hides moderator queues from an editor', () => {
    const payload = counts({ review_staging: 2, review_moderation: 9, quality_city: 4 });
    expect(rankQueueRows(payload, 'editor').map((r) => r.def.countKey)).toEqual(['review_staging']);
    expect(rankQueueRows(payload, 'admin').map((r) => r.def.countKey)).toHaveLength(3);
  });

  it('never fabricates an overdue count for a gate that emits none', () => {
    // A stray `_overdue` key must not be trusted for these two.
    const rows = rankQueueRows(
      counts({ quality_existence: 5, quality_existence_overdue: 5 }),
      'admin',
    );
    expect(rows[0].overdue).toBe(0);
  });

  it('reads SLA hours from the nested sla_hours object by unprefixed key', () => {
    const rows = rankQueueRows(
      counts({ review_staging: 2, sla_hours: { staging: 48, review_staging: 999 } }),
      'admin',
    );
    expect(rows[0].slaHours).toBe(48);
  });

  it('does not treat the sla_hours object as a queue', () => {
    const rows = rankQueueRows(counts({ sla_hours: { staging: 48 } }), 'admin');
    expect(rows).toEqual([]);
  });

  it('ignores unknown keys in the payload', () => {
    const rows = rankQueueRows(counts({ venues: 32000, cities: 3800 }), 'admin');
    expect(rows).toEqual([]);
  });
});

describe('summarizeQueues', () => {
  it('aggregates queue and item totals, counting overdue separately', () => {
    const rows = rankQueueRows(
      {
        review_moderation: 3,
        review_moderation_overdue: 2,
        review_staging: 10,
        review_staging_overdue: 0,
      } as unknown as AdminCounts,
      'admin',
    );
    expect(summarizeQueues(rows)).toEqual({
      queues: 2,
      items: 13,
      overdueQueues: 1,
      overdueItems: 2,
    });
  });

  it('is all zeroes for an empty list', () => {
    expect(summarizeQueues([])).toEqual({
      queues: 0,
      items: 0,
      overdueQueues: 0,
      overdueItems: 0,
    });
  });
});

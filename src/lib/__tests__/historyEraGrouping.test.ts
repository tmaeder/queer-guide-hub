import { describe, expect, it } from 'vitest';
import { HISTORY_ERAS } from '@/config/historyEras';
import {
  groupMilestonesByEra,
  isRestrainedMilestone,
  pickAnchors,
  sumEraCounts,
} from '@/lib/historyEraGrouping';
import type { Milestone } from '@/types/milestone';

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    slug: 's',
    title: 't',
    description: null,
    date: '1970-06-01',
    date_precision: 'day',
    date_end: null,
    date_end_precision: null,
    location: null,
    region: null,
    city_name: null,
    country_name: null,
    city_id: null,
    country_id: null,
    category: 'law-equality',
    impact: 'positive',
    significance: 3,
    sources: [],
    image_url: null,
    tags: [],
    status: 'published',
    seo_indexable: true,
    is_featured: false,
    safety_gated: false,
    ...over,
  };
}

describe('groupMilestonesByEra', () => {
  it('buckets rows by era and keeps every era present', () => {
    const rows = [
      ms({ id: 'a', date: '1533-01-01' }),
      ms({ id: 'b', date: '1969-06-28' }),
      ms({ id: 'c', date: '1970-01-01' }),
      ms({ id: 'd', date: '2024-01-01' }),
    ];
    const grouped = groupMilestonesByEra(rows);
    expect(grouped.size).toBe(HISTORY_ERAS.length);
    expect(grouped.get('hidden-lives')?.map((m) => m.id)).toEqual(['a']);
    expect(grouped.get('liberation')?.map((m) => m.id)).toEqual(['b', 'c']);
    expect(grouped.get('backlash-now')?.map((m) => m.id)).toEqual(['d']);
    expect(grouped.get('destruction')).toEqual([]);
  });
});

describe('pickAnchors', () => {
  it('ranks significance, then featured, then image, then date', () => {
    const rows = [
      ms({ id: 'late-sig5', significance: 5, date: '1975-01-01' }),
      ms({ id: 'featured4', significance: 4, is_featured: true }),
      ms({ id: 'image4', significance: 4, image_url: 'x.jpg' }),
      ms({ id: 'plain4', significance: 4, date: '1969-01-01' }),
    ];
    expect(pickAnchors(rows, 3).map((m) => m.id)).toEqual(['late-sig5', 'featured4', 'image4']);
  });

  it('respects max and does not mutate input', () => {
    const rows = [ms({ id: 'a', significance: 1 }), ms({ id: 'b', significance: 5 })];
    const anchors = pickAnchors(rows, 1);
    expect(anchors.map((m) => m.id)).toEqual(['b']);
    expect(rows.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('sumEraCounts', () => {
  it('sums the year histogram into era totals', () => {
    const counts = sumEraCounts([
      { y: 1533, n: 2 },
      { y: 1969, n: 5 },
      { y: 1970, n: 7 },
      { y: 2024, n: 1 },
    ]);
    expect(counts.get('hidden-lives')).toBe(2);
    expect(counts.get('liberation')).toBe(12);
    expect(counts.get('backlash-now')).toBe(1);
    expect(counts.get('destruction')).toBe(0);
  });
});

describe('isRestrainedMilestone', () => {
  it('forces restraint for persecution category, negative impact, or restrained era', () => {
    expect(isRestrainedMilestone(ms({ category: 'persecution-destruction' }))).toBe(true);
    expect(isRestrainedMilestone(ms({ impact: 'negative' }))).toBe(true);
    expect(isRestrainedMilestone(ms({}), HISTORY_ERAS.find((e) => e.slug === 'aids-crisis'))).toBe(true);
    expect(isRestrainedMilestone(ms({}), HISTORY_ERAS.find((e) => e.slug === 'liberation'))).toBe(false);
    expect(isRestrainedMilestone(ms({}))).toBe(false);
  });
});

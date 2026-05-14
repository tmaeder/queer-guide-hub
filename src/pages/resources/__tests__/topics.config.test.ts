import { describe, it, expect } from 'vitest';
import { TOPIC_HUBS, getTopic, SUPPORT_ORG_TAGS } from '../topics.config';

describe('topics.config', () => {
  it('has at least 6 topics with required fields', () => {
    expect(TOPIC_HUBS.length).toBeGreaterThanOrEqual(6);
    for (const t of TOPIC_HUBS) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.tagCluster.length).toBeGreaterThan(0);
      expect(t.cmsParentSlug).toMatch(/^guides\//);
    }
  });

  it('has unique slugs', () => {
    const slugs = TOPIC_HUBS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('getTopic resolves a known slug and returns undefined for unknown', () => {
    expect(getTopic('coming-out')?.title).toBe('Coming out');
    expect(getTopic('does-not-exist')).toBeUndefined();
  });

  it('exports a non-empty SUPPORT_ORG_TAGS list', () => {
    expect(SUPPORT_ORG_TAGS.length).toBeGreaterThan(0);
    for (const tag of SUPPORT_ORG_TAGS) {
      expect(typeof tag).toBe('string');
      expect(tag.length).toBeGreaterThan(0);
    }
  });
});

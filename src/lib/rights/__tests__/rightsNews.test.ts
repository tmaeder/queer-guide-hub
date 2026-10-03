import { describe, expect, it } from 'vitest';
import { RIGHT_TOPICS } from '../rightsCatalog';
import {
  RIGHTS_NEWS_TAGS,
  RIGHTS_WITH_NEWS,
  newsTagsForRight,
  rightFromNewsParam,
} from '../rightsNews';

describe('rights news taxonomy', () => {
  it('maps every right to at least one canonical slug', () => {
    expect(RIGHTS_WITH_NEWS).toHaveLength(RIGHT_TOPICS.length);
    for (const topic of RIGHT_TOPICS) {
      const tags = newsTagsForRight(topic);
      expect(tags.length, topic.slug).toBeGreaterThan(0);
      expect(new Set(tags).size, topic.slug).toBe(tags.length);
      for (const tag of tags) expect(tag).toMatch(/^[a-z0-9+]+(?:-[a-z0-9+]+)*$/);
    }
  });

  it('does not reintroduce aliases collapsed by the news write gate', () => {
    const tags = Object.values(RIGHTS_NEWS_TAGS).flat();
    expect(tags).not.toContain('marriage-equality');
    expect(tags).not.toContain('hate-crime');
    expect(tags).not.toContain('gay-marriage');
    expect(tags).not.toContain('anti-lgbtq-laws');
  });

  it('accepts only real rights slugs from archive URLs', () => {
    expect(rightFromNewsParam('conversion-therapy')?.slug).toBe('conversion-therapy');
    expect(rightFromNewsParam('not-a-right')).toBeNull();
    expect(rightFromNewsParam(null)).toBeNull();
  });
});

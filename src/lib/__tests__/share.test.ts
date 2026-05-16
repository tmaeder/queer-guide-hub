import { describe, it, expect } from 'vitest';
import { articleShareUrl, estimateReadingTime } from '../share';

describe('share helpers', () => {
  it('articleShareUrl includes slug', () => {
    expect(articleShareUrl('hello-world')).toMatch(/hello-world/);
  });
  it('estimateReadingTime null for empty', () => {
    expect(estimateReadingTime(null, null)).toBeNull();
  });
  it('estimateReadingTime returns positive integer for prose', () => {
    const t = estimateReadingTime('word '.repeat(500));
    expect(t).toBeGreaterThan(0);
  });
});

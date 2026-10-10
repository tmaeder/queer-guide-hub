import { describe, it, expect } from 'vitest';
import { feedbackCategories, feedbackCategoryMap } from '../feedbackCategories';

describe('feedbackCategories', () => {
  it('exports the five supported categories', () => {
    expect(feedbackCategories.map((c) => c.value).sort()).toEqual([
      'bug',
      'content-idea',
      'idea',
      'improvement',
      'safety',
    ]);
  });

  it('every category has label, icon, color', () => {
    for (const c of feedbackCategories) {
      expect(typeof c.label).toBe('string');
      expect(typeof c.color).toBe('string');
      expect(c.icon).toBeDefined();
    }
  });
});

describe('feedbackCategoryMap', () => {
  it('keys the categories by their value', () => {
    expect(feedbackCategoryMap.bug.label).toBe('Bug reports');
    expect(feedbackCategoryMap['content-idea'].label).toBe('Content Idea');
    expect(feedbackCategoryMap.safety.label).toBe('Safety and moderation');
  });

  it('does not include unknown keys', () => {
    expect(feedbackCategoryMap.nope).toBeUndefined();
  });
});

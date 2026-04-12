import { describe, it, expect } from 'vitest';
import {
  CATEGORY_KEYS,
  categoryColor,
  categoryVar,
  categoryBg,
  resolveCategoryKey,
} from '../categoryColors';

describe('CATEGORY_KEYS', () => {
  it('should contain expected categories', () => {
    expect(CATEGORY_KEYS).toContain('venues');
    expect(CATEGORY_KEYS).toContain('events');
    expect(CATEGORY_KEYS).toContain('community');
    expect(CATEGORY_KEYS).toContain('news');
  });
});

describe('categoryColor', () => {
  it('should return hsl with CSS variable', () => {
    expect(categoryColor('venues')).toBe('hsl(var(--cat-venues))');
  });

  it('should work for all categories', () => {
    for (const key of CATEGORY_KEYS) {
      expect(categoryColor(key)).toContain(key);
    }
  });
});

describe('categoryVar', () => {
  it('should return var reference', () => {
    expect(categoryVar('events')).toBe('var(--cat-events)');
  });
});

describe('categoryBg', () => {
  it('should return lower opacity for light mode', () => {
    expect(categoryBg('venues', false)).toContain('0.08');
  });

  it('should return higher opacity for dark mode', () => {
    expect(categoryBg('venues', true)).toContain('0.1');
  });
});

describe('resolveCategoryKey', () => {
  it('should resolve direct matches', () => {
    expect(resolveCategoryKey('venues')).toBe('venues');
    expect(resolveCategoryKey('events')).toBe('events');
  });

  it('should map groups to community', () => {
    expect(resolveCategoryKey('groups')).toBe('community');
  });

  it('should map feed to community', () => {
    expect(resolveCategoryKey('feed')).toBe('community');
  });

  it('should map resources to news', () => {
    expect(resolveCategoryKey('resources')).toBe('news');
  });

  it('should fallback to venues for unknown keys', () => {
    expect(resolveCategoryKey('unknown')).toBe('venues');
  });
});

import { describe, it, expect } from 'vitest';
import { matchNeeds, needLabel, slugsForNeed } from '@/lib/accessibilityNeeds';

describe('slugsForNeed', () => {
  it('maps category needs to vocab slugs', () => {
    expect(slugsForNeed('wheelchair')).toContain('wheelchair-accessible');
    expect(slugsForNeed('hearing')).toEqual(['hearing-loop']);
  });

  it('passes raw vocab slugs through unchanged', () => {
    expect(slugsForNeed('gender-neutral-restroom')).toEqual(['gender-neutral-restroom']);
  });
});

describe('matchNeeds', () => {
  it('splits matched from unlisted needs', () => {
    const { matched, unlisted } = matchNeeds(
      ['wheelchair', 'hearing', 'sensory'],
      ['wheelchair-accessible', 'step-free-entrance'],
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].need).toBe('wheelchair');
    expect(matched[0].matchedSlugs).toEqual(['wheelchair-accessible', 'step-free-entrance']);
    expect(unlisted).toEqual(['hearing', 'sensory']);
  });

  it('treats absence of venue data as unlisted, not unmatched-negative', () => {
    const { matched, unlisted } = matchNeeds(['visual'], []);
    expect(matched).toHaveLength(0);
    expect(unlisted).toEqual(['visual']);
  });
});

describe('needLabel', () => {
  it('humanizes known and unknown needs', () => {
    expect(needLabel('wheelchair')).toBe('Wheelchair access');
    expect(needLabel('some_custom-need')).toBe('some custom need');
  });
});

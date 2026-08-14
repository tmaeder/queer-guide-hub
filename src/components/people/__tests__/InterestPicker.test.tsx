/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { INTEREST_GROUPS, INTEREST_SLUGS } from '@/config/interestVocabulary';

const toggleFollow = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useFollowedTags', () => ({
  useFollowedTags: () => ({
    followedTags: [],
    isFollowing: () => false,
    toggleFollow,
    loading: false,
    signedIn: true,
  }),
}));

const tags = INTEREST_SLUGS.map((slug, i) => ({
  id: `id-${i}`,
  name: slug.replace(/-/g, ' '),
  slug,
}));
const vocabResult = { data: tags };
vi.mock('@/hooks/useInterestVocabularyTags', () => ({
  useInterestVocabularyTags: () => vocabResult,
}));

import { InterestPicker } from '../InterestPicker';

describe('InterestPicker', () => {
  it('renders a chip for every slug the vocabulary resolves', () => {
    render(<InterestPicker />);
    expect(screen.getAllByRole('button')).toHaveLength(INTEREST_SLUGS.length);
  });

  it('renders nothing when the vocabulary resolves to no rows', () => {
    // Rule 2 of the intent pages. Empty group headings would be worse than
    // absence, and every slug could legitimately disappear behind a rename.
    vocabResult.data = [];
    const { container } = render(<InterestPicker />);
    expect(container).toBeEmptyDOMElement();
    vocabResult.data = tags;
  });
});

describe('the vocabulary itself', () => {
  /**
   * THE LOAD-BEARING TEST. profiles.interests feeds people-matching and a match
   * is shown to ANOTHER USER, so an identity term here turns "people who share
   * your interests" into a channel for inferring someone's identity from a
   * profile that never states it. Adding one must fail the build, not ship.
   */
  const IDENTITY_TERMS = [
    'gay', 'lesbian', 'bisexual', 'bi', 'trans', 'transgender', 'queer',
    'nonbinary', 'non-binary', 'intersex', 'asexual', 'ace', 'pansexual',
    'twink', 'bear', 'femme', 'butch', 'poz', 'hiv',
  ];

  it('contains no identity terms', () => {
    const offenders = INTEREST_SLUGS.filter((s) =>
      IDENTITY_TERMS.some((term) => s === term || s.startsWith(`${term}-`) || s.endsWith(`-${term}`)),
    );
    expect(offenders, `identity terms are never matching keys: ${offenders.join(', ')}`).toEqual([]);
  });

  it('has no duplicate slugs across groups', () => {
    expect(new Set(INTEREST_SLUGS).size).toBe(INTEREST_SLUGS.length);
  });

  it('has a non-empty slug list in every group', () => {
    for (const g of INTEREST_GROUPS) {
      expect(g.slugs.length, `${g.label} is empty`).toBeGreaterThan(0);
    }
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { INTEREST_GROUPS, INTEREST_SLUGS } from '@/config/interestVocabulary';

const toggleFollow = vi.fn();
const followState = { signedIn: true, following: new Set<string>() };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: string | Record<string, unknown>) =>
      typeof d === 'object'
        ? String(d.defaultValue).replace(/\{\{(\w+)\}\}/g, (_, v) => String(d[v]))
        : (d ?? k),
  }),
}));
vi.mock('@/hooks/useFollowedTags', () => ({
  useFollowedTags: () => ({
    followedTags: [],
    isFollowing: (id: string) => followState.following.has(id),
    toggleFollow,
    loading: false,
    signedIn: followState.signedIn,
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

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { InterestPicker, MAX_INTERESTS } from '../InterestPicker';

describe('InterestPicker', () => {
  it('renders a chip for every slug the vocabulary resolves', () => {
    render(<InterestPicker />);
    expect(screen.getAllByRole('button')).toHaveLength(INTEREST_SLUGS.length);
  });

  it('shows a sign-in prompt instead of a dead picker when signed out', () => {
    followState.signedIn = false;
    render(<InterestPicker />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth?redirect=/meet',
    );
    followState.signedIn = true;
  });

  it('caps picks at the limit and disables the rest', () => {
    followState.following = new Set(tags.slice(0, MAX_INTERESTS).map((tg) => tg.id));
    render(<InterestPicker />);
    expect(screen.getByText(`${MAX_INTERESTS} of ${MAX_INTERESTS} picked`)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons.filter((b) => b.hasAttribute('disabled'))).toHaveLength(
      INTEREST_SLUGS.length - MAX_INTERESTS,
    );
    followState.following = new Set();
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
    'gay',
    'lesbian',
    'bisexual',
    'bi',
    'trans',
    'transgender',
    'queer',
    'nonbinary',
    'non-binary',
    'intersex',
    'asexual',
    'ace',
    'pansexual',
    'twink',
    'bear',
    'femme',
    'butch',
    'poz',
    'hiv',
  ];

  it('contains no identity terms', () => {
    const offenders = INTEREST_SLUGS.filter((s) =>
      IDENTITY_TERMS.some(
        (term) => s === term || s.startsWith(`${term}-`) || s.endsWith(`-${term}`),
      ),
    );
    expect(offenders, `identity terms are never matching keys: ${offenders.join(', ')}`).toEqual(
      [],
    );
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

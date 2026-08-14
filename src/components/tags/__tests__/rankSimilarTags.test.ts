import { describe, it, expect } from 'vitest';
import { rankSimilarTags } from '../rankSimilarTags';
import type { SimilarTag } from '@/hooks/useTagRelationships';

/** Replaces RelatedTagsCard.test.tsx — the ranking was the only part of that
 *  component worth testing, and testing it directly needs no QueryClient,
 *  router, provider stack or four hook mocks. */
const tag = (over: Partial<SimilarTag>): SimilarTag =>
  ({
    tag_id: 'x',
    name: 'X',
    slug: 'x',
    category: null,
    similarity_score: 0.5,
    is_adult: false,
    ...over,
  }) as SimilarTag;

describe('rankSimilarTags', () => {
  it('floats same-category tags above the rest', () => {
    // The pool is embedding-derived and will happily rank a term from a
    // different part of the taxonomy above a close sibling.
    const ranked = rankSimilarTags(
      [
        tag({ tag_id: 'far', name: 'Far', category: 'Places & Travel', similarity_score: 0.95 }),
        tag({
          tag_id: 'near',
          name: 'Near',
          category: 'Health & Wellness',
          similarity_score: 0.72,
        }),
      ],
      'Health & Wellness',
      false,
    );
    expect(ranked.map((r) => r.tag_id)).toEqual(['near', 'far']);
  });

  it('orders by score within the same category', () => {
    const ranked = rankSimilarTags(
      [
        tag({ tag_id: 'lo', category: 'Health & Wellness', similarity_score: 0.7 }),
        tag({ tag_id: 'hi', category: 'Health & Wellness', similarity_score: 0.9 }),
      ],
      'Health & Wellness',
      false,
    );
    expect(ranked.map((r) => r.tag_id)).toEqual(['hi', 'lo']);
  });

  it('drops adult tags when safe mode is on', () => {
    const input = [tag({ tag_id: 'a', is_adult: true }), tag({ tag_id: 'b' })];
    expect(rankSimilarTags(input, null, true).map((r) => r.tag_id)).toEqual(['b']);
    expect(rankSimilarTags(input, null, false).map((r) => r.tag_id)).toEqual(['a', 'b']);
  });

  it('also drops tags whose CATEGORY is adult but whose flag is not set', () => {
    // Erring toward hiding is deliberate: under-moderation is the worse failure.
    const input = [tag({ tag_id: 'a', category: 'BDSM & Power Exchange' }), tag({ tag_id: 'b' })];
    expect(rankSimilarTags(input, null, true).map((r) => r.tag_id)).toEqual(['b']);
  });

  it('preserves input order when there is no source category', () => {
    const input = [tag({ tag_id: 'a' }), tag({ tag_id: 'b' })];
    expect(rankSimilarTags(input, null, false)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = [
      tag({ tag_id: 'a', category: 'X', similarity_score: 0.1 }),
      tag({ tag_id: 'b', category: 'Y', similarity_score: 0.9 }),
    ];
    rankSimilarTags(input, 'Y', false);
    expect(input.map((r) => r.tag_id)).toEqual(['a', 'b']);
  });

  it('handles an empty pool', () => {
    expect(rankSimilarTags([], 'Health & Wellness', true)).toEqual([]);
  });
});

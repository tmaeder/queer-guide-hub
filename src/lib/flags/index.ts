import { observeReferenceTaxonomies } from '@/lib/referenceTaxonomyStore';
import { PRIDE_FLAGS, type PrideFlag } from './prideFlags';

export { PRIDE_FLAGS, type PrideFlag, type FlagStripe, type FlagOverlay } from './prideFlags';
export { HANKY_CODE, HANKY_CODE_TAG_SLUG, type HankyCodeEntry } from './hankyCode';

/** Maps are derived on demand so backend changes reach all reference surfaces. */
export let flagByTagSlug: ReadonlyMap<string, PrideFlag> = new Map(
  PRIDE_FLAGS.filter((flag) => flag.flagTagSlug).map((flag) => [flag.flagTagSlug!, flag]),
);
observeReferenceTaxonomies((taxonomy) => {
  if (taxonomy === 'pride_flag')
    flagByTagSlug = new Map(
      PRIDE_FLAGS.filter((flag) => flag.flagTagSlug).map((flag) => [flag.flagTagSlug!, flag]),
    );
});
export function flagsForIdentityTag(slug: string | null | undefined): readonly PrideFlag[] {
  return slug ? PRIDE_FLAGS.filter((flag) => flag.identityTagSlugs.includes(slug)) : [];
}
export function flagById(id: string): PrideFlag | undefined {
  return PRIDE_FLAGS.find((flag) => flag.id === id);
}

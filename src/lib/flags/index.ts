import { PRIDE_FLAGS, type PrideFlag } from './prideFlags';

export { PRIDE_FLAGS, type PrideFlag, type FlagStripe, type FlagOverlay } from './prideFlags';
export { HANKY_CODE, HANKY_CODE_TAG_SLUG, type HankyCodeEntry } from './hankyCode';

/** Tag slug that IS a flag → the flag. Drives the full glossary band. */
export const flagByTagSlug: ReadonlyMap<string, PrideFlag> = new Map(
  PRIDE_FLAGS.filter((f) => f.flagTagSlug).map((f) => [f.flagTagSlug as string, f]),
);

const byIdentitySlug = new Map<string, PrideFlag[]>();
for (const flag of PRIDE_FLAGS) {
  for (const slug of flag.identityTagSlugs) {
    const list = byIdentitySlug.get(slug) ?? [];
    list.push(flag);
    byIdentitySlug.set(slug, list);
  }
}

/** Flags an identity tag HAS (lesbian → lesbian flag). Drives the rail card. */
export function flagsForIdentityTag(slug: string | null | undefined): readonly PrideFlag[] {
  if (!slug) return [];
  return byIdentitySlug.get(slug) ?? [];
}

export function flagById(id: string): PrideFlag | undefined {
  return PRIDE_FLAGS.find((f) => f.id === id);
}

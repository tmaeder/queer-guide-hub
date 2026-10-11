/**
 * Per-tag glyph resolution for the glossary.
 *
 * WHY THIS EXISTS. Until 2026-10-10 a tag's plate glyph came from its PARENT
 * taxonomy line, of which there are eight. Measured on prod: 8,460 active tags
 * resolved to 8 glyphs, and the largest line — Sex & Kink — put the identical
 * `consent` mark on **2,415 tags**. A reader scrolling the glossary met the
 * same icon over and over, which is the same thing as no icon at all. The other
 * views were worse: the list row drew the generic pink `#` for every tag and the
 * chip view drew nothing.
 *
 * The fix was mostly an ALLOCATION problem, not a drawing problem. The icon set
 * already contained `rope-play`, `collar`, `flogger`, `paddle`, `handcuffs`,
 * `aftercare`, `safeword`, `intimacy`, `sapphic`, `achillean`, `trans-pride`,
 * `gear-fetish`, `gear-harness` and `toy-condom` — marks drawn for exactly this
 * vocabulary — and the tag system referenced NONE of them. Only two new marks
 * had to be drawn (`harm-reduction`, `body-health`, both for the Health line);
 * see their comments in `transitIconPaths.ts` for the nine motifs that were
 * killed by a collision with a mark that already existed.
 *
 * THE INVARIANT IS SIBLING-SCOPED, NOT GLOBAL. `categoryIdentity.test.ts`
 * asserts the 8 parent icons are unique, and that cannot hold at 46 stops
 * without pushing absurd marks onto real categories. What actually misleads a
 * reader is two stops on ONE line sharing a glyph — those sit side by side in
 * the same filtered grid. Across lines a repeat is cheap. So the table is
 * NESTED BY LINE rather than flat: the nesting is not decoration, it is what
 * makes "siblings never share a glyph" a testable property, and
 * `tagIconography.test.ts` asserts it per line.
 *
 * As it happens the current assignment is fully distinct — 46 stops, 46
 * different glyphs — so the sibling rule has slack. Do not let that become an
 * assumption: the test enforces the sibling rule only, which is the property
 * worth keeping when the taxonomy grows.
 *
 * KEYED BY SLUG, NEVER BY NAME. `tag_categories.slug` is stable;
 * `tag_categories.name` is renamed by editors and carries traps — prod's is
 * literally `Work, School & Institutions`, **with a comma**, and a key spelled
 * without one is silently inert. That silent-inertness is the documented
 * `amenityIcons.ts` failure (a missing `Hand` entry rendered the generic chip
 * for six weeks), and it is what `tagIconography.test.ts` exists to catch.
 */

import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { lineForCategory, DEFAULT_CATEGORY_ICON } from '@/lib/tags/categoryIdentity';

/**
 * Taxonomy stops, grouped by the line they hang off. Outer key is
 * `tag_categories.name` for the parent (what `CATEGORY_LINES` and `parentOrder`
 * speak); inner key is the child's `tag_categories.slug`.
 *
 * Slugs are from `20261006140000_tag_taxonomy_v3_tree.sql`, plus `sex-positions`
 * (`20261023100000`) and `theory-scholarship` (`20360401100000`). Counts in the
 * comments are active tags per stop, measured on prod 2026-10-10 — they are why
 * the assignment leans where it does.
 */
export const STOP_GLYPHS_BY_LINE: Record<string, Record<string, TransitIconName>> = {
  Identity: {
    'sexual-orientation': 'rainbow', // 342
    'gender-identity': 'trans-pride', // 195
    // 56. A bare circle would be the right mark and is unavailable: it is the
    // station primitive (`StationRing`, every roundel, `add-station`). A person
    // is the honest substitute. Shares the line's own mark, which no sibling
    // takes.
    'intersex-bodies': 'profile',
    'questioning-labels': 'info-point', // 47 — an "i": a term being defined
    'expression-presentation': 'apparel', // 192
  },
  'Sex & Kink': {
    'practices-play': 'rope-play', // 409
    'bdsm-power-exchange': 'collar', // 810 — the biggest stop in the corpus
    // 645. `gear-fetish` is a boot, drawn for the marketplace's
    // material-oriented fetish bucket (latex / leather / rubber / uniforms),
    // which is what this stop spans. Objects, never bodies.
    'fetishes-interests': 'gear-fetish',
    'gear-aesthetics': 'gear-harness', // 194
    'sex-positions': 'intimacy', // 198 — the SFW stand-in for sex
    'kink-community': 'meetups', // 85
  },
  'Relationships & Family': {
    'dating-connection': 'saved', // 49
    'relationship-structures': 'share', // 170 — a 3-node graph IS a polycule
    'marriage-partnership': 'jewelry', // 10 — rings, already drawn legibly
    'family-chosen-family': 'home-base', // 72
  },
  Health: {
    'sexual-health': 'health', // 358
    // 146. NOT `selfcare`, which is a lotion bottle drawn for cosmetics —
    // that mark makes mental health a product. `aftercare` is a heart held in
    // an open cupping curve, and it was referenced nowhere.
    'mental-health': 'aftercare',
    'trans-health': 'selfcare', // 62 — gender-affirming CARE
    'physical-reproductive': 'body-health', // 127 — new mark
    'substances-harm-reduction': 'harm-reduction', // 258 — new mark
  },
  'Safety & Consent': {
    'consent-negotiation': 'consent', // 97
    'safer-sex': 'toy-condom', // 48 — a barrier, already drawn
    'violence-hate': 'alerts', // 79 — shares the line's mark; no sibling takes it
    'physical-digital-safety': 'route', // 17
  },
  'Culture & Community': {
    'slang-terminology': 'chat', // 290
    subcultures: 'after-dark', // 128
    'media-film-music': 'tune', // 120
    'art-literature-zines': 'gallery', // 88
    'drag-performance': 'theater', // 47
    'sports-recreation': 'gym', // 36
    'symbols-flags': 'pride', // 52 — the `pride` path is a flag on a pole
  },
  'History & Rights': {
    'movements-milestones': 'events', // 46 — dated milestones
    'figures-icons': 'community', // 61
    'legal-rights': 'documents', // 226
    'political-activism': 'march', // 134 — a placard; shares the line's mark
    'workplace-education-policy': 'hours', // 35 — institutional hours
    'religion-belief': 'compass', // 13 — guidance, non-denominational by design
    // 102. Shares `DEFAULT_CATEGORY_ICON`, so scholarship tags look like
    // unfiled ones. Accepted deliberately: `library` is a books mark and theory
    // IS books, and every alternative is worse for 102 tags.
    'theory-scholarship': 'library',
  },
  'Places & Scene': {
    'venues-nightlife': 'nightlife', // 368
    'safe-spaces': 'filter', // 141 — features and door policy
    'vibe-crowd': 'disco', // 45
    audiences: 'near-you', // 9
    'events-scene': 'ticket', // 223
    accommodation: 'housing', // 32
    'travel-destinations': 'map', // 340 — the line is `compass`, so distinct
    'support-services': 'helpline', // 132
  },
};

/** Flattened for lookup. A slug appearing under two lines is a test failure. */
export const STOP_GLYPHS: Record<string, TransitIconName> = Object.assign(
  {},
  ...Object.values(STOP_GLYPHS_BY_LINE),
);

/**
 * Hand-picked marks for individual terms, GROUPED BY THE STOP THEY SIT IN.
 *
 * This is the tier that makes the glossary read as individual rather than
 * categorical, and the only tier available to `TagChip`, which receives a slug
 * and nothing else.
 *
 * WHY IT IS GROUPED BY STOP RATHER THAN FLAT. An entry is only worth its line
 * if it differs from what the term would already have got from its category —
 * `transgender` under `gender-identity` is already `trans-pride`, so spelling
 * it out again is dead weight that reads like a decision. Grouping by stop lets
 * `tagIconography.test.ts` assert exactly that: **no entry here may equal its
 * own stop's glyph.** Redundancy is a test failure, not a matter of taste.
 *
 * Every mark already exists in the set. Each pick is a term whose own object or
 * concept is drawn — the implement, the garment, the room, the flag — so the
 * glyph is about THAT term and not its neighbourhood. Terms with no honestly
 * distinct mark are deliberately absent and inherit their stop; a forced pick
 * is worse than an inherited one. The `darkroom` precedent is the warning on
 * the other side: an obvious-looking match can be the wrong sense entirely.
 *
 * Stop keys must exist in `STOP_GLYPHS_BY_LINE`; the test enforces it, so a
 * renamed stop fails loudly instead of silently orphaning its terms.
 */
export const TERM_GLYPHS_BY_STOP: Record<string, Record<string, TransitIconName>> = {
  // Who someone is. The two orientation marks were drawn for this vocabulary
  // and referenced nowhere until now.
  'sexual-orientation': {
    gay: 'achillean',
    'gay-men': 'achillean',
    lesbian: 'sapphic',
    sapphic: 'sapphic',
  },

  // Gear is the densest hand-picked stop, because every item in it is drawn.
  'gear-aesthetics': {
    dildo: 'toy-dildo',
    'silicone-dildo': 'toy-dildo',
    'anal-plug': 'toy-plug',
    'chastity-device': 'toy-chastity',
    collar: 'collar',
    restraints: 'handcuffs',
    'impact-toys': 'paddle',
    paddle: 'paddle',
    leather: 'gear-fetish',
    latex: 'gear-fetish',
    jockstrap: 'underwear',
    apparel: 'apparel',
  },

  'fetishes-interests': {
    underwear: 'underwear',
    lingerie: 'underwear',
    panties: 'underwear',
    'butt-plugs': 'toy-plug',
    denim: 'apparel',
    socks: 'apparel',
  },

  'practices-play': {
    darkroom: 'after-dark',
    pegging: 'toy-dildo',
    'suction-cup-dildo': 'toy-dildo',
    cage: 'toy-chastity',
    'chest-harness': 'gear-harness',
    'impact-play': 'paddle',
  },

  'bdsm-power-exchange': {
    hoods: 'gear-hood',
    flogging: 'flogger',
    gag: 'gear-gag',
    aftercare: 'aftercare',
  },

  'kink-community': {
    puppy: 'gear-pup',
    pup: 'gear-pup',
    'sex-party': 'disco',
    'play-party': 'disco',
  },

  // Consent has purpose-drawn marks that are not the category mark.
  'consent-negotiation': {
    'safe-word': 'safeword',
    communication: 'chat',
  },

  'safer-sex': { lubricant: 'toy-lube', lube: 'toy-lube' },

  'sexual-health': {
    lube: 'toy-lube',
    'men-who-have-sex-with-men': 'achillean',
    wellness: 'selfcare',
  },

  'mental-health': { 'self-care': 'selfcare' },

  // Gender-affirming items, each drawn as an object rather than a body.
  'trans-health': { gaff: 'underwear', 'pack-er': 'underwear', 'top-surgery': 'body-health' },

  'substances-harm-reduction': { poppers: 'toy-poppers' },

  'symbols-flags': { rainbow: 'rainbow', 'trans-flag': 'trans-pride' },

  'expression-presentation': { swimwear: 'swimwear', bikini: 'swimwear', nature: 'outdoor' },

  'venues-nightlife': {
    'cruising-ground': 'after-dark',
    'hot-springs': 'sauna',
    sauna: 'sauna',
    bathhouse: 'sauna',
    megaclub: 'disco',
    'beer-store': 'shop',
  },

  'art-literature-zines': { theater: 'theater', books: 'library', writer: 'documents' },

  'media-film-music': { actor: 'theater', 'film-festival': 'ticket' },

  'drag-performance': { voguing: 'disco' },

  'events-scene': { sexparty: 'disco', 'outdoor-event': 'outdoor', clubnight: 'disco' },

  'movements-milestones': {
    stonewall: 'march',
    'stonewall-riots': 'march',
    'pride-history': 'pride',
    'trans-pride': 'trans-pride',
  },

  'legal-rights': { 'trans-rights': 'trans-pride', 'civil-rights': 'march' },

  'political-activism': { 'conversion-therapy': 'alerts' },

  'violence-hate': { 'hate-speech': 'chat' },

  'physical-digital-safety': { police: 'alerts', bullying: 'alerts' },

  'theory-scholarship': { 'queer-theory': 'documents' },

  // Individual people, as against the stop's mark for the category of them.
  'figures-icons': { 'harvey-milk': 'profile', 'sylvia-rivera': 'profile' },

  'dating-connection': { intimacy: 'intimacy', flirting: 'chat' },

  'relationship-structures': { dating: 'saved' },

  accommodation: { villa: 'home-base', 'nudist-retreat': 'outdoor' },

  'travel-destinations': { 'car-rental': 'route', 'queer-travel': 'compass' },

  'safe-spaces': { 'gender-neutral-bathroom': 'restroom' },

  'vibe-crowd': { 'gym-bunnies': 'gym' },

  'sports-recreation': { 'nude-yoga': 'outdoor' },

  'support-services': { 'housing-instability': 'housing' },

  'slang-terminology': { spanking: 'paddle', femme: 'salon', 'rainbow-flag': 'rainbow' },

  // Ballroom and the leather scene live HERE, not under Drag & Performance —
  // checked against the corpus rather than guessed, which is also what makes
  // `theater` a real pick here instead of a restatement of drag's own mark.
  subcultures: {
    ballroom: 'theater',
    'ballroom-culture': 'theater',
    'leather-community': 'gear-fetish',
    jock: 'gym',
    'japanese-culture': 'cafe',
  },
};

/** Flattened for lookup, keyed by `unified_tags.slug`. */
export const TAG_GLYPH_OVERRIDES: Record<string, TransitIconName> = Object.assign(
  {},
  ...Object.values(TERM_GLYPHS_BY_STOP),
);

/**
 * Last-resort tier for a tag with no category at all. Reach is small and
 * honest: of the 455 unfiled active tags, 84 are `attribute` (38 of those being
 * `size-*`/`color-*` marketplace facets) and the 371 unfiled `concept` terms
 * still land on `library`, because nothing on those rows says what they are
 * about. Corpus-wide `entity_kind` is overwhelmingly `concept` (7,211), so this
 * is tail cleanup, not a load-bearing tier.
 */
export const KIND_GLYPHS: Record<string, TransitIconName> = {
  place: 'map',
  person: 'profile',
  attribute: 'filter',
  audience: 'near-you',
};

/**
 * The term's glyph if and ONLY if it has one of its own — no category tier, no
 * fallback. For `TagChip`, which receives a slug and nothing else.
 *
 * Returning `undefined` rather than the `library` fallback is the point: a chip
 * renders on venue, event and news pages as well as the glossary, and stamping
 * a books glyph on every unrecognised term there would be noise. A chip with no
 * mark is already the established look (`icon` defaults to false), so the only
 * visible change is that recognisable terms gain a real mark.
 */
export function tagGlyphOverride(slug?: string | null): TransitIconName | undefined {
  return TAG_GLYPH_OVERRIDES[slug ?? ''];
}

/**
 * The tag's glyph, most specific tier first. Total function — always returns a
 * real `TransitIconName`.
 *
 * `stopSlug` is the primary category's OWN slug whether it is a stop or a line;
 * a line slug simply misses tier 2 and tier 3 resolves it, so no caller has to
 * know a category's level.
 */
export function resolveTagGlyph(input: {
  slug?: string | null;
  stopSlug?: string | null;
  parentName?: string | null;
  entityKind?: string | null;
}): TransitIconName {
  return (
    TAG_GLYPH_OVERRIDES[input.slug ?? ''] ??
    STOP_GLYPHS[input.stopSlug ?? ''] ??
    lineForCategory(input.parentName)?.icon ??
    KIND_GLYPHS[input.entityKind ?? ''] ??
    DEFAULT_CATEGORY_ICON
  );
}

/**
 * Pride flags — the hand-curated vocabulary behind the glossary flag bands,
 * the Symbols & Flags wall, and (later) profile identity flags.
 *
 * This is a committed TS const on purpose, same reasoning as
 * `src/lib/rights/tagRightTopics.ts`: a small, consequential vocabulary that
 * Postgres cannot FK-constrain and no external source can sync. Stripe colours
 * and meanings are ASSERTED FACTS — every hex here was checked against the
 * Wikimedia Commons SVG of the flag (or the designer's published spec) at
 * curation time. Do not "normalize" them to design tokens: the colour IS the
 * content, and this file is allowlisted in both ESLint functional-colour
 * blocks for exactly that reason. Do not build an enrichment sweep to extend
 * this list — additions are hand-researched, like the legal citations.
 *
 * Stripe meanings use `t(meaningKey, meaningEn)` so English ships from here
 * and locale files can translate incrementally. A flag whose designer
 * deliberately declined to assign stripe meanings (leather, bear) carries a
 * `noteEn` instead of per-stripe text — inventing meanings would be wrong in
 * the same way inventing a citation is.
 *
 * Two link directions, one record: `flagTagSlug` is the glossary tag that IS
 * the flag (full band on that page); `identityTagSlugs` are the tags that
 * HAVE the flag (compact rail card). A slug must never appear on both sides —
 * the unit test enforces it.
 */

export interface FlagStripe {
  hex: string;
  /** Relative height; default 1. Bisexual is 2:1:2, demisexual 9:2:9. */
  weight?: number;
  meaningKey?: string;
  meaningEn?: string;
}

export type FlagOverlay =
  | { kind: 'chevron'; colors: readonly string[] }
  | { kind: 'circle'; ringHex: string }
  | { kind: 'triangle'; hex: string }
  | { kind: 'heart'; hex: string }
  | { kind: 'paw'; hex: string };

export interface PrideFlag {
  id: string;
  nameKey: string;
  nameEn: string;
  designer?: string;
  year?: number;
  stripes: readonly FlagStripe[];
  overlay?: FlagOverlay;
  /** Rendered under the stripe list — chevron meanings, designer's intent. */
  noteKey?: string;
  noteEn?: string;
  /** unified_tags slug that IS this flag. */
  flagTagSlug?: string;
  /** unified_tags slugs that HAVE this flag. */
  identityTagSlugs: readonly string[];
}

const RAINBOW: readonly FlagStripe[] = [
  { hex: '#E50000', meaningKey: 'flags.meanings.rainbow.red', meaningEn: 'Life' },
  { hex: '#FF8D00', meaningKey: 'flags.meanings.rainbow.orange', meaningEn: 'Healing' },
  { hex: '#FFEE00', meaningKey: 'flags.meanings.rainbow.yellow', meaningEn: 'Sunlight' },
  { hex: '#028121', meaningKey: 'flags.meanings.rainbow.green', meaningEn: 'Nature' },
  { hex: '#004CFF', meaningKey: 'flags.meanings.rainbow.blue', meaningEn: 'Serenity' },
  { hex: '#770088', meaningKey: 'flags.meanings.rainbow.violet', meaningEn: 'Spirit' },
];

export const PRIDE_FLAGS: readonly PrideFlag[] = [
  {
    id: 'rainbow-pride',
    nameKey: 'flags.names.rainbow-pride',
    nameEn: 'Rainbow Pride Flag',
    designer: 'Gilbert Baker',
    year: 1978,
    stripes: RAINBOW,
    noteKey: 'flags.notes.rainbow-pride',
    noteEn:
      'Gilbert Baker’s original 1978 flag carried eight stripes; the six-stripe version became the standard in 1979.',
    flagTagSlug: 'pride-flag',
    identityTagSlugs: ['queer', 'gay', 'lgbtq'],
  },
  {
    id: 'progress-pride',
    nameKey: 'flags.names.progress-pride',
    nameEn: 'Progress Pride Flag',
    designer: 'Daniel Quasar',
    year: 2018,
    stripes: RAINBOW,
    overlay: { kind: 'chevron', colors: ['#FFFFFF', '#FFAFC8', '#74D7EE', '#613915', '#000000'] },
    noteKey: 'flags.notes.progress-pride',
    noteEn:
      'The chevron adds the trans flag colours, brown and black for communities of colour, and black for those living with HIV/AIDS and those lost to it — pointing right to show forward motion.',
    flagTagSlug: 'progress-pride-flag',
    identityTagSlugs: ['queer'],
  },
  {
    id: 'transgender-pride',
    nameKey: 'flags.names.transgender-pride',
    nameEn: 'Transgender Pride Flag',
    designer: 'Monica Helms',
    year: 1999,
    stripes: [
      {
        hex: '#5BCEFA',
        meaningKey: 'flags.meanings.trans.blue',
        meaningEn: 'Traditional colour for boys',
      },
      {
        hex: '#F5A9B8',
        meaningKey: 'flags.meanings.trans.pink',
        meaningEn: 'Traditional colour for girls',
      },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.trans.white',
        meaningEn: 'Those transitioning, intersex people, and those of neutral or undefined gender',
      },
      {
        hex: '#F5A9B8',
        meaningKey: 'flags.meanings.trans.pink',
        meaningEn: 'Traditional colour for girls',
      },
      {
        hex: '#5BCEFA',
        meaningKey: 'flags.meanings.trans.blue',
        meaningEn: 'Traditional colour for boys',
      },
    ],
    noteKey: 'flags.notes.transgender-pride',
    noteEn: 'The pattern is symmetrical, so the flag is always correct however it is flown.',
    flagTagSlug: 'transgender-pride-flag',
    identityTagSlugs: ['transgender', 'trans'],
  },
  {
    id: 'bisexual-pride',
    nameKey: 'flags.names.bisexual-pride',
    nameEn: 'Bisexual Pride Flag',
    designer: 'Michael Page',
    year: 1998,
    stripes: [
      {
        hex: '#D60270',
        weight: 2,
        meaningKey: 'flags.meanings.bi.pink',
        meaningEn: 'Same-gender attraction',
      },
      {
        hex: '#9B4F96',
        weight: 1,
        meaningKey: 'flags.meanings.bi.purple',
        meaningEn: 'Attraction across the gender spectrum',
      },
      {
        hex: '#0038A8',
        weight: 2,
        meaningKey: 'flags.meanings.bi.blue',
        meaningEn: 'Different-gender attraction',
      },
    ],
    flagTagSlug: 'bisexual-pride-flag',
    identityTagSlugs: ['bisexual'],
  },
  {
    id: 'pansexual-pride',
    nameKey: 'flags.names.pansexual-pride',
    nameEn: 'Pansexual Pride Flag',
    year: 2010,
    stripes: [
      { hex: '#FF218C', meaningKey: 'flags.meanings.pan.pink', meaningEn: 'Attraction to women' },
      {
        hex: '#FFD800',
        meaningKey: 'flags.meanings.pan.yellow',
        meaningEn: 'Attraction to non-binary people',
      },
      { hex: '#21B1FF', meaningKey: 'flags.meanings.pan.blue', meaningEn: 'Attraction to men' },
    ],
    flagTagSlug: 'pansexual-pride-flag',
    identityTagSlugs: ['pansexual'],
  },
  {
    id: 'lesbian-pride',
    nameKey: 'flags.names.lesbian-pride',
    nameEn: 'Lesbian Pride Flag',
    designer: 'Emily Gwen',
    year: 2018,
    stripes: [
      {
        hex: '#D52D00',
        meaningKey: 'flags.meanings.lesbian.darkOrange',
        meaningEn: 'Gender non-conformity',
      },
      { hex: '#EF7627', meaningKey: 'flags.meanings.lesbian.orange', meaningEn: 'Independence' },
      { hex: '#FF9A56', meaningKey: 'flags.meanings.lesbian.lightOrange', meaningEn: 'Community' },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.lesbian.white',
        meaningEn: 'Unique relationships to womanhood',
      },
      {
        hex: '#D162A4',
        meaningKey: 'flags.meanings.lesbian.pink',
        meaningEn: 'Serenity and peace',
      },
      { hex: '#B55690', meaningKey: 'flags.meanings.lesbian.dustyPink', meaningEn: 'Love and sex' },
      { hex: '#A30262', meaningKey: 'flags.meanings.lesbian.darkRose', meaningEn: 'Femininity' },
    ],
    flagTagSlug: 'lesbian-pride-flag',
    identityTagSlugs: ['lesbian'],
  },
  {
    id: 'gay-men-pride',
    nameKey: 'flags.names.gay-men-pride',
    nameEn: 'Gay Men’s Pride Flag',
    year: 2019,
    stripes: [
      { hex: '#078D70', meaningKey: 'flags.meanings.gaymen.green1', meaningEn: 'Community' },
      { hex: '#26CEAA', meaningKey: 'flags.meanings.gaymen.green2', meaningEn: 'Healing' },
      { hex: '#98E8C1', meaningKey: 'flags.meanings.gaymen.green3', meaningEn: 'Joy' },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.gaymen.white',
        meaningEn: 'Trans and gender non-conforming gay men',
      },
      { hex: '#7BADE2', meaningKey: 'flags.meanings.gaymen.blue1', meaningEn: 'Pure love' },
      { hex: '#5049CC', meaningKey: 'flags.meanings.gaymen.blue2', meaningEn: 'Fortitude' },
      { hex: '#3D1A78', meaningKey: 'flags.meanings.gaymen.blue3', meaningEn: 'Diversity' },
    ],
    flagTagSlug: 'gay-men-pride-flag',
    identityTagSlugs: ['gay'],
  },
  {
    id: 'nonbinary-pride',
    nameKey: 'flags.names.nonbinary-pride',
    nameEn: 'Non-Binary Pride Flag',
    designer: 'Kye Rowan',
    year: 2014,
    stripes: [
      {
        hex: '#FFF433',
        meaningKey: 'flags.meanings.nb.yellow',
        meaningEn: 'Genders outside the binary',
      },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.nb.white',
        meaningEn: 'People with many or all genders',
      },
      {
        hex: '#9B59D0',
        meaningKey: 'flags.meanings.nb.purple',
        meaningEn: 'Genders that mix male and female',
      },
      {
        hex: '#2D2D2D',
        meaningKey: 'flags.meanings.nb.black',
        meaningEn: 'People without a gender',
      },
    ],
    flagTagSlug: 'nonbinary-pride-flag',
    identityTagSlugs: ['non-binary', 'nonbinary'],
  },
  {
    id: 'genderfluid-pride',
    nameKey: 'flags.names.genderfluid-pride',
    nameEn: 'Genderfluid Pride Flag',
    designer: 'JJ Poole',
    year: 2012,
    stripes: [
      { hex: '#FF75A2', meaningKey: 'flags.meanings.gf.pink', meaningEn: 'Femininity' },
      { hex: '#F5F5F5', meaningKey: 'flags.meanings.gf.white', meaningEn: 'All genders' },
      {
        hex: '#BE18D6',
        meaningKey: 'flags.meanings.gf.purple',
        meaningEn: 'Both masculinity and femininity',
      },
      { hex: '#2C2C2C', meaningKey: 'flags.meanings.gf.black', meaningEn: 'The absence of gender' },
      { hex: '#333EBD', meaningKey: 'flags.meanings.gf.blue', meaningEn: 'Masculinity' },
    ],
    flagTagSlug: 'genderfluid-pride-flag',
    identityTagSlugs: ['genderfluid'],
  },
  {
    id: 'genderqueer-pride',
    nameKey: 'flags.names.genderqueer-pride',
    nameEn: 'Genderqueer Pride Flag',
    designer: 'Marilyn Roxie',
    year: 2011,
    stripes: [
      { hex: '#B57EDC', meaningKey: 'flags.meanings.gq.lavender', meaningEn: 'Androgyny' },
      { hex: '#FFFFFF', meaningKey: 'flags.meanings.gq.white', meaningEn: 'Agender identities' },
      { hex: '#4A8123', meaningKey: 'flags.meanings.gq.green', meaningEn: 'Non-binary identities' },
    ],
    flagTagSlug: 'genderqueer-pride-flag',
    identityTagSlugs: ['genderqueer'],
  },
  {
    id: 'agender-pride',
    nameKey: 'flags.names.agender-pride',
    nameEn: 'Agender Pride Flag',
    designer: 'Salem X',
    year: 2014,
    stripes: [
      {
        hex: '#000000',
        meaningKey: 'flags.meanings.agender.black',
        meaningEn: 'The absence of gender',
      },
      {
        hex: '#B9B9B9',
        meaningKey: 'flags.meanings.agender.grey',
        meaningEn: 'Semi-genderlessness',
      },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.agender.white',
        meaningEn: 'The absence of gender',
      },
      {
        hex: '#B8F483',
        meaningKey: 'flags.meanings.agender.green',
        meaningEn: 'Non-binary genders',
      },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.agender.white',
        meaningEn: 'The absence of gender',
      },
      {
        hex: '#B9B9B9',
        meaningKey: 'flags.meanings.agender.grey',
        meaningEn: 'Semi-genderlessness',
      },
      {
        hex: '#000000',
        meaningKey: 'flags.meanings.agender.black',
        meaningEn: 'The absence of gender',
      },
    ],
    flagTagSlug: 'agender-pride-flag',
    identityTagSlugs: ['agender'],
  },
  {
    id: 'asexual-pride',
    nameKey: 'flags.names.asexual-pride',
    nameEn: 'Asexual Pride Flag',
    year: 2010,
    stripes: [
      { hex: '#000000', meaningKey: 'flags.meanings.ace.black', meaningEn: 'Asexuality' },
      {
        hex: '#A3A3A3',
        meaningKey: 'flags.meanings.ace.grey',
        meaningEn: 'Grey-asexuality and demisexuality',
      },
      { hex: '#FFFFFF', meaningKey: 'flags.meanings.ace.white', meaningEn: 'Sexuality and allies' },
      { hex: '#800080', meaningKey: 'flags.meanings.ace.purple', meaningEn: 'Community' },
    ],
    noteKey: 'flags.notes.asexual-pride',
    noteEn: 'Chosen by community vote on the Asexual Visibility and Education Network in 2010.',
    flagTagSlug: 'asexual-pride-flag',
    identityTagSlugs: ['asexual'],
  },
  {
    id: 'aromantic-pride',
    nameKey: 'flags.names.aromantic-pride',
    nameEn: 'Aromantic Pride Flag',
    designer: 'Cameron Whimsy',
    year: 2014,
    stripes: [
      { hex: '#3DA542', meaningKey: 'flags.meanings.aro.green', meaningEn: 'Aromanticism' },
      {
        hex: '#A7D379',
        meaningKey: 'flags.meanings.aro.lightGreen',
        meaningEn: 'The aromantic spectrum',
      },
      {
        hex: '#FFFFFF',
        meaningKey: 'flags.meanings.aro.white',
        meaningEn: 'Platonic and aesthetic attraction',
      },
      { hex: '#A9A9A9', meaningKey: 'flags.meanings.aro.grey', meaningEn: 'Grey-aromantic people' },
      {
        hex: '#000000',
        meaningKey: 'flags.meanings.aro.black',
        meaningEn: 'The sexuality spectrum',
      },
    ],
    flagTagSlug: 'aromantic-pride-flag',
    identityTagSlugs: ['aromantic'],
  },
  {
    id: 'demisexual-pride',
    nameKey: 'flags.names.demisexual-pride',
    nameEn: 'Demisexual Pride Flag',
    stripes: [
      {
        hex: '#FFFFFF',
        weight: 9,
        meaningKey: 'flags.meanings.demi.white',
        meaningEn: 'Sexuality',
      },
      {
        hex: '#6E0070',
        weight: 2,
        meaningKey: 'flags.meanings.demi.purple',
        meaningEn: 'Community',
      },
      {
        hex: '#D2D2D2',
        weight: 9,
        meaningKey: 'flags.meanings.demi.grey',
        meaningEn: 'Grey-asexuality',
      },
    ],
    overlay: { kind: 'triangle', hex: '#000000' },
    noteKey: 'flags.notes.demisexual-pride',
    noteEn: 'The black triangle at the hoist stands for asexuality.',
    flagTagSlug: 'demisexual-pride-flag',
    identityTagSlugs: ['demisexual'],
  },
  {
    id: 'intersex-pride',
    nameKey: 'flags.names.intersex-pride',
    nameEn: 'Intersex Pride Flag',
    designer: 'Morgan Carpenter',
    year: 2013,
    stripes: [
      {
        hex: '#FFD800',
        meaningKey: 'flags.meanings.intersex.yellow',
        meaningEn: 'Yellow and purple — chosen as colours free of gendered associations',
      },
    ],
    overlay: { kind: 'circle', ringHex: '#7902AA' },
    noteKey: 'flags.notes.intersex-pride',
    noteEn: 'The unbroken circle stands for wholeness and the right to bodily autonomy.',
    flagTagSlug: 'intersex-pride-flag',
    identityTagSlugs: ['intersex'],
  },
  {
    id: 'leather-pride',
    nameKey: 'flags.names.leather-pride',
    nameEn: 'Leather Pride Flag',
    designer: 'Tony DeBlase',
    year: 1989,
    stripes: [
      { hex: '#000000' },
      { hex: '#2A2A7F' },
      { hex: '#000000' },
      { hex: '#2A2A7F' },
      { hex: '#FFFFFF' },
      { hex: '#2A2A7F' },
      { hex: '#000000' },
      { hex: '#2A2A7F' },
      { hex: '#000000' },
    ],
    overlay: { kind: 'heart', hex: '#E70039' },
    noteKey: 'flags.notes.leather-pride',
    noteEn:
      'DeBlase deliberately assigned no meanings to the stripes or the heart, leaving interpretation to the viewer.',
    flagTagSlug: 'leather-pride-flag',
    identityTagSlugs: ['leather'],
  },
  {
    id: 'bear-brotherhood',
    nameKey: 'flags.names.bear-brotherhood',
    nameEn: 'Bear Brotherhood Flag',
    designer: 'Craig Byrnes',
    year: 1995,
    stripes: [
      { hex: '#623804' },
      { hex: '#D56300' },
      { hex: '#FEDD63' },
      { hex: '#FEE6B8' },
      { hex: '#FFFFFF' },
      { hex: '#555555' },
      { hex: '#000000' },
    ],
    overlay: { kind: 'paw', hex: '#000000' },
    noteKey: 'flags.notes.bear-brotherhood',
    noteEn:
      'The stripes represent the fur colours of bears around the world, not individual meanings.',
    flagTagSlug: 'bear-brotherhood-flag',
    identityTagSlugs: ['bear'],
  },
];

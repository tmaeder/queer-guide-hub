/** Icon System v2 — icon data.
 *
 *  THE FORMAT, in one paragraph. An icon is `f` (closed shapes, drawn first,
 *  each with an ink outline, filled either with the icon's own track colour
 *  `"T"` or with paper `"P"`) then `l` (open strokes drawn on top, ink at the
 *  base weight unless given a colour and a weight multiplier). Later fills
 *  paint over earlier ones, so `f` runs back to front. `ring()` is the one
 *  helper: a closed circle, usable in either list.
 *
 *  WHAT CHANGED FROM v1, and why it is not a cosmetic refactor. v1 was one ink
 *  stroke per icon and nothing else — no fills, no colour, no metadata. The
 *  drawings are carried over verbatim into `l` wherever they were already
 *  curve-only; what is new is a track colour per icon, a motion-tick set, a
 *  group, and a one-line `use`. An icon with a genuinely enclosed mass gained
 *  a `"T"` fill; an icon that is honestly just a line carries its colour as an
 *  ink-under / colour-over stroke pair instead, because inventing a fill mass
 *  for a line drawing would change what the icon depicts.
 *
 *  KEYED BY SLUG, NAMED BY TITLE. The record key stays the v1 kebab slug
 *  (`'near-you'`) because 55 call sites, the map's pin rasteriser and
 *  `brandAssetSync` all address icons by it; `name` is the Title Case display
 *  string the spec's §9 checklist and the sheet's search box use. The two are
 *  drift-tested against each other.
 *
 *  RULES A READER OF THIS FILE WILL BREAK IF NOT TOLD. (1) No `L`, `H` or `V`,
 *  ever — a "straight" line is a cubic whose control points wobble ~2 units off
 *  the chord. (2) The body lives between 12 and 88; only motion ticks and thin
 *  tails go outside. (3) One track colour per icon — `pride` is the single
 *  sanctioned exception and nothing else may join it. (4) The outline is always
 *  ink; colour sits inside it, never as it, with the one exception of a `"T"`
 *  stroke that has an ink stroke underneath. (5) Figures have no faces.
 *  (6) Kink icons show gear, symbols and safety — never bodies or acts.
 *  `__tests__/iconSpec.test.ts` enforces every one of those that a parser can
 *  decide; §8 legibility stays a human pass.
 */

/** §4b. Nightlife, love, alerts, destructive, kink gear. */
export const M = '#FF1F8F';
/** §4b. Care, info, trans, travel logistics, UI navigation. */
export const C = '#00B4E6';
/** §4b. Community, safety, success, outdoors. */
export const G = '#2BE05A';
/** §4b. Culture, events, money, warnings, highlights. */
export const Y = '#FFD500';
/** The outline colour. Never a track colour, in either theme — polarity
 *  belongs to the artwork, not the theme. */
export const ink = '#111111';
/** Windows, doors, inner holes, station rings and highlights. */
export const paper = '#FAFAF5';

export type TrackColor = typeof M | typeof C | typeof G | typeof Y;

/** `"T"` = this icon's track colour. `"P"` = paper.
 *
 *  A literal track colour is also accepted, and exists ONLY for `pride`: §4b
 *  allows one icon to carry several tracks and says nothing else may join it.
 *  The spec test asserts that no other icon uses a literal, so the exemption
 *  cannot spread by a second author copying the pattern. */
export type FillKind = 'T' | 'P' | TrackColor;

/** A closed shape: the path, and what goes inside the ink outline. */
export type FilledShape = [d: string, fill: FillKind];

/**
 * An open stroke, in one of three forms:
 *   `"M …"`                 ink at the base weight
 *   `["M …", "T", 1.1]`     the track colour at base × 1.1
 *   `["M …", "P", 1.3]`     paper at base × 1.3 — a highlight inside a fill
 *   `["M …", null, 2.2]`    ink at base × 2.2
 * The last two exist as a pair: to outline a coloured strap, add the ink line
 * at 2.2 first and the same path in colour at 1.1 on top. That pair is the one
 * sanctioned way a track colour appears as a stroke rather than a fill.
 */
export type Stroke = string | [d: string, color: 'T' | 'P' | TrackColor | null, weight: number];

export interface IconDef {
  /** Title Case, 1-3 words, unique across the set. */
  name: string;
  group: (typeof ICON_GROUPS)[number];
  /** One of M / C / G / Y, chosen by meaning. */
  hex: TrackColor;
  /** Motion-tick set. `none` for calm or sensitive content, and for anything
   *  that already draws its own motion. */
  t: (typeof TICK_SETS)[number];
  /** When to use it, for a designer. 12 words or fewer. */
  use: string;
  /** Closed shapes, back to front. Optional: a line drawing has none. */
  f?: FilledShape[];
  /** Open strokes, drawn over the fills. */
  l?: Stroke[];
}

/** §6. Extending this means extending the sheet's own `groups` array too.
 *  `Market` is added for the catalogue departments, which are not places —
 *  a physical shop is a `Places` venue, a department of 18,000 listings is not. */
export const ICON_GROUPS = [
  'Queer',
  'Kink',
  'Travel',
  'Events',
  'Wayfinding',
  'People',
  'Community',
  'Signals',
  'Safety',
  'Places',
  'Market',
  'Actions',
] as const;

export const TICK_SETS = ['crown', 'sides', 'top', 'corners', 'burst', 'wave', 'none'] as const;

/**
 * A closed circle. Emitted as two semicircular arcs rather than four quarter
 * arcs so the bounds checker can read the radius straight back off the data,
 * and matching v1's own ring shape byte for byte so the carried-over drawings
 * are unchanged.
 */
export function ring(cx: number, cy: number, r: number): string {
  return `M ${cx + r} ${cy} a ${r} ${r} 0 1 0 ${-2 * r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0`;
}

/**
 * Outline weight by rendered size, in path units.
 *
 * 9 / 11 / 13. v1's 9/10/11 was tuned for a single ink stroke on paper; a v2
 * mark is an outline AROUND a fill, so the same number renders a hairline
 * casing with almost no colour showing through at the 12-20px sizes most of
 * this product uses.
 *
 * EXPORTED, AND READ BY THE SPEC TEST, because the counter and band floors are
 * derived from the widest value here. Restating the ramp in the test is how the
 * floors silently stop matching the renderer: that is exactly what happened
 * when this went 9/10/11 -> 9/11/13 while `MAX_SW` stayed at 11, leaving the
 * minimum counter radius computed against a stroke two units thinner than the
 * one actually drawn.
 */
export function strokeWidthFor(size: number): number {
  return size >= 32 ? 9 : size >= 24 ? 11 : 13;
}

/** The widest outline the renderer ever draws. Every §3 floor derives from it. */
export const MAX_STROKE_WIDTH = strokeWidthFor(0);

/**
 * §5. Motion ticks. Short curved strokes in the margin (0-12 and 88-100) that
 * make an icon feel alive, and that the renderer drops below 32px because at
 * that size they are noise rather than life.
 *
 * These are shared geometry, not per-icon data: a tick set is a property of the
 * SHAPE's behaviour — radiating, moving sideways, standing upright — so two
 * icons that radiate should tick identically. Per-icon tick paths would let
 * them drift apart for no reason anyone could state.
 */
/**
 * How heavy a motion tick is, as a fraction of the body outline.
 *
 * THE MARGIN IS 12 UNITS AND THE OUTLINE IS 9-13, so a tick drawn at the body
 * weight fills 75-108% of the space it is supposed to float in. That is why the
 * first version read as horns, ears and bolts rather than as motion: at that
 * weight a tick is not a mark beside the shape, it is a second piece of body
 * pressed against it. Measured on the contact sheet — `theater` rendered as a
 * horned devil, and every garment in the Market group grew a pair of ears.
 *
 * 0.4 puts the stroke at ~4-5 units in a 12-unit margin, which leaves air on
 * both sides and reads as a drawn motion line.
 */
export const TICK_WEIGHT = 0.4;

export const TICKS: Record<Exclude<(typeof TICK_SETS)[number], 'none'>, string[]> = {
  /** Three above: things that radiate or announce. */
  crown: ['M 50 11 C 52 8 52 5 50 2', 'M 30 11 C 31 7 29 5 27 2', 'M 70 11 C 69 7 71 5 73 2'],
  /** Left and right: things that move sideways or shake. */
  sides: ['M 11 50 C 8 48 5 52 2 50', 'M 89 50 C 92 48 95 52 98 50'],
  /** Upper left and upper right: upright objects. */
  top: ['M 16 11 C 12 10 11 6 9 3', 'M 84 11 C 88 10 89 6 91 3'],
  /** All four corners: round or symmetric shapes. */
  corners: [
    'M 11 11 C 7 10 5 7 3 2',
    'M 89 11 C 93 10 95 7 97 2',
    'M 11 89 C 7 90 5 93 3 98',
    'M 89 89 C 93 90 95 93 97 98',
  ],
  /** Sides and top: high energy. */
  burst: [
    'M 11 46 C 8 44 5 48 2 46',
    'M 89 46 C 92 44 95 48 98 46',
    'M 34 11 C 35 7 33 5 31 2',
    'M 66 11 C 65 7 67 5 69 2',
  ],
  /** Top right only: greeting gestures. */
  wave: ['M 86 11 C 89.7 11.3 92.7 9.3 95 6', 'M 90 22 C 93.5 22.4 96.5 21.4 99 19'],
};

/**
 * The ink-under / colour-over pair of §2: an ink stroke at 2.2× the base
 * weight with the same path in the track colour at 1.1× on top, which reads as
 * a coloured strap with an ink casing.
 *
 * It exists because a line drawing has no enclosed mass to fill, and roughly
 * half this set is a line drawing. Inventing a mass for them so they could
 * take a fill would change what they depict; this gives them the icon's track
 * colour without redrawing anything. Pass a multi-subpath `d` to colour a
 * whole figure with one pair rather than one pair per stroke.
 */
const colored = (d: string): Stroke[] => [
  [d, null, 2.2],
  [d, 'T', 1.1],
];

/**
 * The same idiom at the base weight: ink at 1.0 with the colour at 0.45 inside
 * it, leaving a ~0.27×sw hairline of casing on each side.
 *
 * `colored()` is the spec's own 2.2/1.1, and it is right for a glyph drawn as a
 * STRAP — a lens ring, two wide-set arcs. This set is mostly v1 line art tuned
 * to a single 1.0 weight, and widening that to 2.2 does not make it bolder, it
 * makes it a different picture: the flogger's four falls merged into one pink
 * moth, and every glyph with internal spacing under ~20 units closed up solid.
 *
 * So the multiplier is a per-icon decision, not a constant. Use `colored` when
 * the drawing has room, `tinted` when it does not — and check the contact sheet,
 * because which one applies is a fact about the drawing, not about the category.
 */
const tinted = (d: string): Stroke[] => [
  [d, null, 1],
  [d, 'T', 0.45],
];

/**
 * `satisfies` on the literal, then a typed view over it — both halves needed.
 *
 * An annotation (`const ICON_DEFS: Record<string, IconDef>`) widens the keys to
 * `string`, and `TransitIconName` is derived from those keys, so the literal
 * union 55 call sites type-check against would silently become `string` and
 * every icon name in the app would stop being checked. `satisfies` alone has
 * the opposite problem: it infers 59 distinct object shapes, so `def.f` does
 * not exist on the ones that are pure line drawings. Keep the literal for its
 * keys, re-expose it typed for its values.
 */
const DEFS = {
  // ── Wayfinding ───────────────────────────────────────────────────────────
  // A ring used as a STROKE, not a fill: the lens is a window, so filling it
  // with paper over a paper card would be invisible and filling it with the
  // track colour would put colour where the user looks through.
  search: {
    name: 'Search',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Site search and result lists.',
    l: [...colored(ring(44, 44, 24)), 'M 61 61 C 66.9 69.1 72.9 75.1 80 80'],
  },

  route: {
    name: 'Route',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Directions and routes between two places.',
    l: [
      ...colored('M 22 78 C 44 76 38 50 56 44 C 70 39 72 34 78 26'),
      // The two station rings stay OPEN ink circles rather than filled dots.
      // At radius 7 against this stroke weight they do fill in solid — which is
      // exactly why `public/favicon.svg` rejected this glyph as the app icon —
      // but in a row of icons the neighbours supply the context the browser tab
      // could not, and "a point of interest is an open circle" is the rule the
      // whole wayfinding set is drawn to.
      ring(22, 78, 7),
      ring(78, 26, 7),
    ],
  },

  saved: {
    name: 'Saved',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Saved items, favourites and bookmarks.',
    f: [
      [
        'M 50 82 C 32 66 22 54 22 42 C 22 30 31 22 41 22 C 47 22 50 26 50 32 C 50 26 53 22 59 22 C 69 22 78 30 78 42 C 78 54 68 66 50 82 Z',
        'T',
      ],
    ],
  },

  chat: {
    name: 'Chat',
    group: 'Community',
    hex: C,
    t: 'none',
    use: 'Direct messages and conversations.',
    f: [
      [
        'M 50 20 C 30 20 16 31 16 45 C 16 59 30 70 50 70 C 53.2 71.5 56.2 71.5 59 69 C 64 75 70 79 78 81 C 75 75 74 71 74 66 C 80 60 84 53 84 45 C 84 31 70 20 50 20 Z',
        'T',
      ],
    ],
    // Radius 3.5, so these deliberately fill in solid and read as three ink
    // dots on the bubble. A paper counter this small is invisible — the floor
    // for a hole is radius 7 — so they are strokes, not fills.
    l: [`${ring(35.5, 45, 3.5)} ${ring(49.5, 45, 3.5)} ${ring(63.5, 45, 3.5)}`],
  },

  community: {
    name: 'Community',
    group: 'Community',
    hex: G,
    t: 'none',
    use: 'Groups, members and community spaces.',
    // Open heads. Filled discs plus crown ticks read as two eyes and a pair of
    // antennae — §7.1 bans faces on figures, and this was drawing one by
    // accident.
    l: [
      ...tinted(`${ring(32, 34, 12)} M 14 76 C 18 62 24 56 32 56 C 40 56 44 60 50 66`),
      ...tinted(`${ring(68, 34, 12)} M 86 76 C 82 62 76 56 68 56 C 60 56 56 60 50 66`),
    ],
  },

  health: {
    name: 'Health',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Sexual health services, clinics and testing.',
    // A PULSE, not a cross. v1 drew this as a circle with a plus inside it and
    // so did `add-station`, which left hue as the only thing separating them —
    // §8.7, and a violation of "colour is never the only cue" besides.
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 28 50 C 34 49 36 38 40 50 C 44 62 48 38 54 50 C 58 59 64 51 70 50'],
  },

  filter: {
    name: 'Filter',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Narrow a list down by facet.',
    l: tinted(
      'M 22 34 C 40 30 60 38 78 34 M 30 52 C 44 48 58 56 72 52 M 40 70 C 48 67 54 72 62 70',
    ),
  },

  'add-station': {
    name: 'Add station',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Add a new place, event or entry.',
    f: [[ring(50, 50, 32), 'T']],
    l: ['M 50 36 C 48.5 45 48.5 55 50 64', 'M 36 50 C 45 51.5 55 51.5 64 50'],
  },

  // One of the four v1 glyphs that used straight segments: `H 70` and `H 30`
  // are cubics now, bowed 1 unit, so the ticket keeps its silhouette.
  ticket: {
    name: 'Ticket',
    group: 'Events',
    hex: Y,
    t: 'none',
    use: 'Tickets, entry prices and door policy.',
    f: [
      [
        'M 20 40 C 20 34 24 30 30 30 C 43 29 57 29 70 30 C 76 30 80 34 80 40 C 74 42 74 58 80 60 C 80 66 76 70 70 70 C 57 71 43 71 30 70 C 24 70 20 66 20 60 C 26 58 26 42 20 40 Z',
        'T',
      ],
    ],
    l: ['M 50 42 C 51 47 51 53 50 58'],
  },

  // `V 70` on the right edge is a cubic now, bowed 1 unit outward.
  map: {
    name: 'Map',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Map views and geographic browsing.',
    f: [
      [
        'M 20 30 C 30 25 40 25 50 29 C 60 33 70 33 80 28 C 81 42 81 56 80 70 C 70 75 60 75 50 71 C 40 67 30 67 20 72 Z',
        'T',
      ],
    ],
    l: ['M 38 28 C 39 42 37 56 38 69', 'M 62 31 C 61 44 63 58 62 72'],
  },

  'after-dark': {
    name: 'After dark',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Late-night venues and after-hours listings.',
    f: [
      [
        'M 62 20 C 48 26 40 38 40 52 C 40 66 48 76 62 82 C 44 84 28 70 28 51 C 28 32 44 18 62 20 Z',
        'T',
      ],
    ],
  },

  tune: {
    name: 'Tune',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Adjust ranking, weighting and preferences.',
    f: [
      [ring(40, 37, 7), 'T'],
      [ring(62, 63, 7), 'T'],
    ],
    l: ['M 22 38 C 40 34 60 42 78 38', 'M 22 62 C 40 58 60 66 78 62'],
  },

  compass: {
    name: 'Compass',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Explore and discover what is nearby.',
    f: [
      [ring(50, 50, 34), 'T'],
      ['M 64 34 C 56 40 48 50 40 64 C 42 52 48 40 64 34 Z', 'P'],
    ],
  },

  'home-base': {
    name: 'Home base',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'The reader’s home city or saved base.',
    l: [
      ...colored('M 22 50 C 32 38 42 28 50 22 C 58 28 68 38 78 50'),
      'M 30 46 C 29 57 29 68 30 78 C 43 80 57 80 70 78 C 71 68 71 57 70 46',
      ring(50, 62, 7),
    ],
  },

  profile: {
    name: 'Profile',
    group: 'People',
    hex: C,
    t: 'none',
    use: 'A member’s profile and account.',
    // Drawn the same way as `community`, and that consistency is the point: a
    // filled head over an ink shoulder stroke puts the colour on the smallest
    // part of the figure, so at sidebar size it read as a BLACK icon sitting
    // next to a visibly green `community`. Two figure glyphs, one treatment.
    l: [...tinted(`${ring(50, 32, 12)} M 24 78 C 28 62 36 54 50 54 C 64 54 72 62 76 78`)],
  },

  alerts: {
    name: 'Alerts',
    group: 'Signals',
    hex: M,
    t: 'sides',
    use: 'Notifications, alerts and unread counts.',
    f: [
      [
        'M 30 64 C 30 46 34 30 50 30 C 66 30 70 46 70 64 C 73.1 67.2 75.1 69.2 78 70 C 60 74 40 74 22 70 C 24.9 69.2 26.9 67.2 30 64 Z',
        'T',
      ],
    ],
    l: ['M 44 82 C 48 85 52 85 56 82', 'M 50 30 C 49 26 49 24 50 21'],
  },

  helpline: {
    name: 'Helpline',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Crisis lines and support phone numbers.',
    f: [
      [
        'M 26 22 C 20 28 18 36 22 46 C 30 64 44 76 60 80 C 68 82 76 78 80 70 C 74 64 68 60 62 60 C 57.1 60.8 55.1 62.8 54 66 C 44 60 38 52 34 44 C 37 41 39 38 40 34 C 38 28 32 24 26 22 Z',
        'T',
      ],
    ],
  },

  hours: {
    name: 'Hours',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Opening hours and time windows.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 50 32 C 48.5 39 48.5 46 50 52 C 56 54 61 57 65 61'],
  },

  library: {
    name: 'Library',
    group: 'Community',
    hex: Y,
    t: 'none',
    use: 'Guides, articles and saved reading.',
    l: [
      ...colored(
        'M 50 28 C 42 22 32 20 22 22 C 21 38 21 54 22 72 C 32 70 42 72 50 78 C 58 72 68 70 78 72 C 79 54 79 38 78 22 C 68 20 58 22 50 28',
      ),
      'M 50 28 C 48.5 44 48.5 60 50 78',
    ],
  },

  nightlife: {
    name: 'Nightlife',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Bars, clubs and nightlife venues.',
    f: [
      [ring(31, 76, 9), 'T'],
      [ring(74, 66, 9), 'T'],
    ],
    l: ['M 40 76 C 39 60 39 44 40 30 C 52 26 64 28 74 34 C 72.5 44 72.5 54 74 66'],
  },

  meetups: {
    name: 'Meetups',
    group: 'Community',
    hex: G,
    t: 'none',
    use: 'Meetups, socials and casual gatherings.',
    f: [
      [
        'M 26 40 C 40 36 60 36 74 40 C 74 52 70 66 62 74 C 54 76 46 76 38 74 C 30 66 26 52 26 40 Z',
        'T',
      ],
    ],
    l: [
      'M 74 44 C 82 44 84 52 80 58 C 77 62 73 62 70 60',
      'M 40 26 C 42 22 42 20 40 16',
      'M 54 26 C 56 22 56 20 54 16',
    ],
  },

  housing: {
    name: 'Housing',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Housing, rooms and places to stay.',
    f: [[ring(30, 40, 14), 'T']],
    l: [
      'M 43 47 C 53 58.1 65 69.1 78 78',
      'M 64 70 C 59.8 73.1 57.8 76.1 57 80',
      'M 74 78 C 69.9 79.9 67.9 81.9 67 85',
    ],
  },

  documents: {
    name: 'Documents',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Documents, records and attachments.',
    f: [
      [
        'M 28 24 C 26.5 42 26.5 60 28 78 C 42 80 56 80 72 78 C 73.5 64 73.5 50 72 36 C 66.8 30.8 60.8 26.8 54 24 C 45 23 36 23 28 24 Z',
        'T',
      ],
    ],
    l: [
      'M 54 24 C 52.5 28 52.5 32 54 36 C 60 37.5 66 37.5 72 36',
      'M 40 52 C 46 50 54 54 60 52',
      'M 40 64 C 46 62 54 66 60 64',
    ],
  },

  share: {
    name: 'Share',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Share a page or send someone a link.',
    f: [
      [ring(27, 50, 9), 'T'],
      [ring(73, 26, 9), 'T'],
      [ring(73, 74, 9), 'T'],
    ],
    l: ['M 35 45 C 45.6 41.4 55.6 37.4 65 31', 'M 35 55 C 44.4 61.4 54.4 65.4 65 69'],
  },

  'info-point': {
    name: 'Info point',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Explanatory notes, help text and definitions.',
    f: [[ring(50, 50, 34), 'T']],
    // The one glyph §7.5 permits inside an icon, drawn as strokes: an "i".
    l: ['M 50 46 C 48.5 53 48.5 60 50 68', ring(50, 32, 3)],
  },

  // ── Queer ────────────────────────────────────────────────────────────────
  sapphic: {
    name: 'Sapphic',
    group: 'Queer',
    hex: M,
    t: 'none',
    use: 'Sapphic, lesbian and women-loving-women content.',
    // A VENUS SYMBOL IS ONE LINE DRAWING, not a disc with a cross beside it.
    // Filling the rings and leaving the crosses as separate ink strokes merged
    // the casing into the cross and the pair rendered as a SKULL at 80px. Ring
    // and cross are one figure at one weight, which is how v1 drew them.
    l: [
      ...tinted(`${ring(42, 36, 13)} M 42 49 C 40.5 57 40.5 64 42 72 M 33 62 C 39 61 45 63 51 62`),
      ...tinted(`${ring(66, 36, 13)} M 66 49 C 64.5 57 64.5 64 66 72 M 57 62 C 63 61 69 63 75 62`),
    ],
  },

  achillean: {
    name: 'Achillean',
    group: 'Queer',
    hex: C,
    t: 'none',
    use: 'Achillean, gay and men-loving-men content.',
    // Same rule as `sapphic`: circle and arrow are one figure.
    l: [
      ...tinted(
        `${ring(44, 60, 15)} M 54 49 C 61.1 43 66.1 37 71 29 M 71 29 C 66 27.5 62 27.5 58 29 M 71 29 C 69.5 33 69.5 37 71 41 M 58 53 C 66.8 49.3 74.8 45.3 82 39 M 82 39 C 77.2 36.5 73.2 36.5 69 37 M 82 39 C 78.6 42.4 77.6 46.4 77 51`,
      ),
    ],
  },

  'trans-pride': {
    name: 'Trans pride',
    group: 'Queer',
    // Cyan is the trans track by the colour table's own entry, so this is the
    // one icon whose hue is not a free choice.
    hex: C,
    t: 'none',
    use: 'Trans and non-binary identity and content.',
    // Same rule as `sapphic`: circle, both arrows and the cross are one figure.
    l: [
      ...tinted(
        `${ring(50, 58, 14)} M 60 48 C 66.2 43 70.2 38 74 31 M 74 31 C 69 29.5 65 29.5 62 31 M 74 31 C 72.5 35 72.5 39 74 43 M 40 48 C 36.2 41 32.2 36 26 31 M 28 44 C 33.1 41.1 37.1 37.1 40 32 M 50 72 C 48.5 76 48.5 80 50 85 M 42 79 C 47 78 53 78 58 79`,
      ),
    ],
  },

  // `H 62` and `H 38` on the banner are cubics now.
  march: {
    name: 'March',
    group: 'Queer',
    hex: M,
    t: 'burst',
    use: 'Marches, protests and political action.',
    // `H 62` and `H 38` on the banner are cubics now. The station ring v1 put
    // in the middle is gone: at radius 7 it is on the floor for a paper hole,
    // so it ate the banner's centre and left a blob on a stick.
    f: [
      [
        'M 24 32 C 24 24 30 18 38 18 C 46 17 54 17 62 18 C 70 18 76 24 76 32 C 76 40 70 46 62 46 C 54 47 46 47 38 46 C 30 46 24 40 24 32 Z',
        'T',
      ],
    ],
    l: ['M 50 86 C 49 72 49 58 50 46'],
  },

  disco: {
    name: 'Disco',
    group: 'Events',
    hex: M,
    // `corners`, not `burst`: a disco ball is a round symmetric shape, and
    // burst's two upper ticks landed over the ball and read as antennae.
    t: 'corners',
    use: 'Club nights, parties and dancing.',
    f: [[ring(50, 48, 28), 'T']],
    l: [
      'M 50 20 C 44 38 44 58 50 76',
      'M 24 40 C 40 44 60 44 76 40',
      'M 26 58 C 41 54 59 54 74 58',
      'M 50 12 C 49 14 49 16 50 20',
    ],
  },

  // ── Safety ───────────────────────────────────────────────────────────────
  consent: {
    name: 'Consent',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Consent, boundaries and negotiation.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 36 52 C 39 57 43 61 48 64 C 53 54 59 45 66 38'],
  },

  safeword: {
    name: 'Safeword',
    group: 'Safety',
    hex: G,
    // Calm content: stopping a scene is not a moment that wants jaunty ticks.
    t: 'none',
    use: 'Safewords and stopping a scene.',
    f: [
      [
        'M 50 22 C 32 22 18 32 18 45 C 18 58 32 68 50 68 C 53.2 69.5 56.2 69.5 59 67 C 64 73 70 77 78 79 C 75 73 74 69 74 64 C 80 58 82 52 82 45 C 82 32 68 22 50 22 Z',
        'T',
      ],
    ],
    // Two strokes, not three. v1's vertical bar plus two diagonals made an
    // asterisk whose arms merged at this weight and read as a four-leaf clover.
    l: ['M 39 34 C 45 41.1 53 48.1 61 54', 'M 61 34 C 53 38.9 45 45.9 39 54'],
  },

  // ── Kink ─────────────────────────────────────────────────────────────────
  // §7.2 throughout this group: gear, symbols and safety — never bodies, never
  // acts.
  handcuffs: {
    name: 'Handcuffs',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Restraint gear and bondage equipment.',
    // Open cuffs, not filled discs: two solid pink circles joined by a curve
    // read as a pair of GLASSES. The hole is what makes a cuff a cuff.
    l: [...tinted(`${ring(27, 48, 13)} ${ring(73, 48, 13)} M 37 57 C 43 66 57 66 63 57`)],
  },

  'rope-play': {
    name: 'Rope play',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Rope, shibari and tie gear.',
    // A SPIRAL, because §8.3 is not satisfied by a small offset. Two loops with
    // a 2.8-unit offset still rendered a clean BULLSEYE — at this scale the eye
    // reads concentricity long before it reads a few units of eccentricity. A
    // spiral has no second closed loop to be concentric with, which is the only
    // thing that actually fixed it.
    //
    // It also has to differ from `intimacy` (two interlocking rings) and from
    // `search` (a circle with a tail), both of which this icon has already been
    // mistaken for once.
    l: [
      ...tinted(
        'M 72 48 C 72 33 61 21 47 21 C 33 21 22 34 22 49 C 22 62 32 72 45 72 C 56 72 64 63 64 54 C 64 46 58 40 51 40',
      ),
    ],
  },

  collar: {
    name: 'Collar',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Collars and ownership dynamics.',
    // The band is INK at the base weight and the TAG carries the colour, which
    // is the way round that survives: a 2.2x coloured band over the tag read as
    // a fat pink smile, and a band ending at the tag's own centre simply
    // painted over it. The band stops at y=62 so the tag hangs clear below it,
    // and the tag is drawn first so the band crosses in front of its top —
    // which is how a tag hangs off a collar.
    f: [[ring(50, 74, 10), 'T']],
    l: ['M 22 38 C 26 54 36 62 50 62 C 64 62 74 54 78 38'],
  },

  paddle: {
    name: 'Paddle',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Impact play gear and spanking equipment.',
    // The blade is deliberately NOT a circle: §8.7, a disc on a stick is the
    // silhouette `rope-play` and `search` already carry. Squaring the shoulders
    // and flattening the top is what separates the three at 24px. The centre
    // dot is gone with it — at radius 6 it is below the floor for a hole, so it
    // rendered as an ink blot rather than a rivet.
    f: [
      [
        'M 34 18 C 44 15 56 15 66 18 C 69 30 69 44 66 56 C 56 59 44 59 34 56 C 31 44 31 30 34 18 Z',
        'T',
      ],
    ],
    l: ['M 50 59 C 51 68 51 76 50 84'],
  },

  flogger: {
    name: 'Flogger',
    group: 'Kink',
    hex: M,
    t: 'burst',
    use: 'Floggers, whips and impact toys.',
    l: [
      ...tinted(
        'M 50 44 C 40 56 34 68 30 82 M 50 44 C 48 58 46 70 46 84 M 50 44 C 52.6 58.5 56.6 70.5 62 82 M 50 44 C 58 54 66 64 72 74',
      ),
      'M 50 16 C 48.5 26 48.5 36 50 44',
      'M 44 20 C 47 19 53 19 56 20',
    ],
  },

  // ── Venue categories ─────────────────────────────────────────────────────
  restaurant: {
    name: 'Restaurant',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Restaurants and places to eat.',
    l: tinted(
      'M 36 84 C 37.5 66 37.5 54 36 44 M 28 20 C 28 30 30 38 36 44 C 42 38 44 30 44 20 M 36 20 C 34.5 26 34.5 32 36 38 M 64 84 C 65.5 66 65.5 52 64 44 C 72 38 74 28 70 18 C 66 22 64 32 64 44',
    ),
  },

  cafe: {
    name: 'Cafe',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Cafés, coffee bars and daytime venues.',
    f: [['M 26 38 C 26 58 35 72 50 72 C 65 72 74 58 74 38 C 58 36 42 36 26 38 Z', 'T']],
    l: ['M 74 44 C 84 42 88 52 82 58 C 79 61 76 61 73 60', 'M 20 82 C 34 86 66 86 80 82'],
  },

  shop: {
    name: 'Shop',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Shops, boutiques and retail venues.',
    f: [
      [
        'M 26 38 C 42 36 58 36 74 38 C 76 54 76 66 74 80 C 58 82 42 82 26 80 C 24 66 24 54 26 38 Z',
        'T',
      ],
    ],
    l: ['M 38 38 C 38 26 43 20 50 20 C 57 20 62 26 62 38'],
  },

  gym: {
    name: 'Gym',
    group: 'Places',
    hex: G,
    t: 'none',
    use: 'Gyms, fitness venues and sports clubs.',
    l: tinted(
      'M 34 50 C 42 51.5 58 51.5 66 50 M 26 36 C 24 45 24 55 26 64 M 34 32 C 32 44 32 56 34 68 M 74 36 C 76 45 76 55 74 64 M 66 32 C 68 44 68 56 66 68',
    ),
  },

  salon: {
    name: 'Salon',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Salons, barbers and grooming venues.',
    f: [
      [ring(24, 76, 10), 'T'],
      [ring(76, 76, 10), 'T'],
    ],
    l: ['M 28 68 C 41.2 52.9 55.2 34.9 68 16', 'M 72 68 C 61.2 51.1 47.2 33.1 32 16'],
  },

  gallery: {
    name: 'Gallery',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Galleries, museums and exhibitions.',
    f: [
      [
        'M 22 26 C 40 24 60 24 78 26 C 80 44 80 60 78 76 C 60 78 40 78 22 76 C 20 60 20 44 22 26 Z',
        'T',
      ],
    ],
    l: ['M 28 68 C 36 56 42 48 50 48 C 58 48 66 58 72 68', ring(60, 38, 6)],
  },

  theater: {
    name: 'Theater',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Theatres, cinemas and performance venues.',
    f: [['M 24 30 C 40 26 60 26 76 30 C 76 52 66 74 50 82 C 34 74 24 52 24 30 Z', 'T']],
    // A mask, not a face: §7.1 bans features on a FIGURE, and this is the
    // object itself. Two dots and a curve are what make it read as a mask
    // rather than a shield at 24px.
    l: [`${ring(39, 46, 4)} ${ring(61, 46, 4)}`, 'M 38 58 C 44 64 56 64 62 58'],
  },

  sauna: {
    name: 'Sauna',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Saunas, bathhouses and cruising venues.',
    f: [
      [
        'M 22 62 C 40 58 60 58 78 62 C 76.5 70 76.5 74 78 78 C 60 80 40 80 22 78 C 23.5 74 23.5 70 22 62 Z',
        'T',
      ],
    ],
    l: [
      'M 34 46 C 30 38 38 32 34 22',
      'M 50 46 C 46 38 54 32 50 22',
      'M 66 46 C 62 38 70 32 66 22',
    ],
  },

  // A door, not a figure: the gendered pictograms are not ours to draw, and a
  // wheelchair would claim an accessibility fact the data does not carry.
  restroom: {
    name: 'Restroom',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Public toilets and restrooms.',
    f: [
      [
        'M 28 18 C 44 16 56 16 72 18 C 74 44 74 62 72 84 C 56 86 44 86 28 84 C 26 62 26 44 28 18 Z',
        'T',
      ],
    ],
    l: ['M 62 52 C 57 50.5 52 50.5 47 52', ring(63, 52, 5)],
  },

  outdoor: {
    name: 'Outdoor',
    group: 'Places',
    hex: G,
    t: 'none',
    use: 'Parks, beaches and outdoor spaces.',
    f: [
      [
        'M 50 16 C 38.8 29.2 30.8 41.2 26 52 C 34 55 42 56 50 56 C 58 56 66 55 74 52 C 69.2 41.2 61.2 29.2 50 16 Z',
        'T',
      ],
    ],
    l: ['M 50 56 C 48.5 68 48.5 78 50 86'],
  },

  // ── Marketplace departments ──────────────────────────────────────────────
  apparel: {
    name: 'Apparel',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Clothing and apparel listings.',
    f: [
      [
        'M 38 24 C 32 25 26 28 20 33 C 18 39 18 45 20 51 C 24.4 52.5 28.4 51.5 32 48 C 31 59 31 71 32 82 C 44 84 56 84 68 82 C 69 71 69 59 68 48 C 71.6 51.5 75.6 52.5 80 51 C 82 45 82 39 80 33 C 74 28 68 25 62 24 C 58 30 54 33 50 33 C 46 33 42 30 38 24 Z',
        'T',
      ],
    ],
  },

  underwear: {
    name: 'Underwear',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Underwear, jockstraps and base layers.',
    l: tinted(
      'M 22 34 C 41 31 59 31 78 34 M 22 34 C 23 46 26 56 31 64 C 34 69 36 74 37 80 C 41 81 45 81 48 80 C 50.5 70.1 50.5 62.1 50 56 C 49.5 62.1 49.5 70.1 52 80 C 55 81 59 81 63 80 C 64 74 66 69 69 64 C 74 56 77 46 78 34',
    ),
  },

  swimwear: {
    name: 'Swimwear',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Swimwear, trunks and beachwear.',
    f: [
      [
        'M 22 33 C 41 30 59 30 78 33 C 75.5 44.8 73.5 56.8 73 69 C 66 71 59 71 52 69 C 52.5 62.8 51.5 56.8 50 51 C 48.5 56.8 47.5 62.8 48 69 C 41 71 34 71 27 69 C 26.5 56.8 24.5 44.8 22 33 Z',
        'T',
      ],
    ],
    l: ['M 43 41 C 46 44 54 44 57 41'],
  },

  jewelry: {
    name: 'Jewelry',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Jewellery, rings and accessories.',
    f: [
      [
        'M 50 48 C 45 53 41 59 41 65 C 41 73 45 79 50 79 C 55 79 59 73 59 65 C 59 59 55 53 50 48 Z',
        'T',
      ],
    ],
    l: ['M 20 26 C 30 40 40 48 50 48 C 60 48 70 40 80 26'],
  },

  homeware: {
    name: 'Homeware',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Home goods, decor and houseware.',
    f: [['M 34 45 C 38 33 42 24 50 24 C 58 24 62 33 66 45 C 55 47 45 47 34 45 Z', 'T']],
    l: ['M 50 47 C 49 57 49 67 50 75', 'M 36 79 C 45 77 55 77 64 79'],
  },

  selfcare: {
    name: 'Selfcare',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Grooming, skincare and self-care products.',
    f: [
      [
        'M 38 45 C 37 57 37 69 38 79 C 46 81 54 81 62 79 C 63 69 63 57 62 45 C 54 43 46 43 38 45 Z',
        'T',
      ],
    ],
    l: [
      'M 44 45 C 47 39 46 35 46 33 C 50 32 54 32 58 33',
      'M 46 33 C 42 31 38 28 36 24 C 40 22 44 22 48 24',
    ],
  },

  // Two interlocking rings. Intimacy is a department of the catalogue, not a
  // depiction: the fine buckets under it (`sex_toys`, `chastity`, …) have no
  // mark that is both legible at 44px and printable on a page that is SFW by
  // default, and this tile renders BEFORE the 18+ opt-in.
  intimacy: {
    name: 'Intimacy',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Intimacy and adult product departments.',
    f: [
      [ring(38, 50, 18), 'T'],
      [ring(62, 50, 18), 'T'],
    ],
  },

  // The pin is a genuine enclosed mass, so it fills; the hole in it is paper
  // at radius 8, comfortably over the radius-5 floor where counters fill in.
  'near-you': {
    name: 'Near you',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Results sorted by distance from the reader.',
    f: [
      [
        'M 50 86 C 36 68 28 56 28 42 C 28 28 38 18 50 18 C 62 18 72 28 72 42 C 72 56 64 68 50 86 Z',
        'T',
      ],
      [ring(50, 42, 8), 'P'],
    ],
  },

  // ── Events ───────────────────────────────────────────────────────────────
  // One of the four v1 glyphs that used straight segments. `H 66`, `V 68` and
  // `H 34` are now cubics whose control points sit 1 unit off the chord, so the
  // silhouette is the same calendar and nothing in it is dead straight. The two
  // hangers needed the same treatment for the same reason — `M 36 16 C 36 20 36
  // 24 36 28` holds x at 36 throughout, which is a straight line written as a
  // cubic and still breaks the rule.
  events: {
    name: 'Events',
    group: 'Events',
    hex: Y,
    // `sides`, not `crown`, and the reason generalises: a tick set may not
    // collide with the icon's OWN projections. The calendar's two hangers
    // already stand up out of the body, and crown's three ticks land directly
    // above them — the glyph stopped reading as a calendar and started reading
    // as a robot with antennae. Ticks are motion, not more drawing.
    t: 'none',
    use: 'Event listings, calendars and date pickers.',
    f: [
      [
        'M 20 36 C 20 28 26 24 34 24 C 45 23 55 23 66 24 C 74 24 80 28 80 36 C 81 47 81 57 80 68 C 80 76 74 80 66 80 C 55 81 45 81 34 80 C 26 80 20 76 20 68 Z',
        'T',
      ],
      [ring(50, 56, 8), 'P'],
    ],
    l: ['M 36 16 C 35 20 35 24 36 28', 'M 64 16 C 65 20 65 24 64 28'],
  },

  // ── Queer ────────────────────────────────────────────────────────────────
  // THE ONLY MULTI-TRACK ICON. The four bands are the four tracks, which is the
  // one place in the product where they appear together outside
  // `.intersection-gradient`. Written as literal colours rather than "T"
  // because the icon has no single track colour; `hex` records the first band
  // so the field is never meaningless. Nothing else may do this and the spec
  // test asserts it.
  //
  // IT HAS NO MAST, AND THAT IS ARITHMETIC RATHER THAN TASTE. A band needs ~16
  // units of pitch to survive its own ink outline (see MIN_FILL_PITCH in the
  // spec test), so four bands need 64 of the 76 units the body box allows.
  // Drawn as a flag on a pole, the mast then has nowhere below the flag to go:
  // the first attempt put four 9-unit bands on a pole and rendered a SOLID
  // BLACK BLOB at every size, because each band's interior was 9 - 10.4 units,
  // i.e. negative. Filling the box with the flag itself is what buys the pitch.
  pride: {
    name: 'Pride',
    group: 'Queer',
    hex: M,
    t: 'burst',
    use: 'Pride events, queer identity and the brand mark.',
    f: [
      ['M 14 20 C 38 13 62 27 86 19 C 84.5 24 84.5 29 86 35 C 62 43 38 29 14 36 Z', M],
      ['M 14 36 C 38 29 62 43 86 35 C 84.5 40 84.5 45 86 51 C 62 59 38 45 14 52 Z', C],
      ['M 14 52 C 38 45 62 59 86 51 C 84.5 56 84.5 61 86 67 C 62 75 38 61 14 68 Z', G],
      ['M 14 68 C 38 61 62 75 86 67 C 84.5 71 84.5 75 86 80 C 62 87 38 73 14 80 Z', Y],
    ],
  },

  // The app icon. `public/favicon.svg` carries this geometry verbatim and
  // `brandAssetSync.test.ts` pins the two together, so the two arcs are stored
  // as ONE path string: the derived ink path below has to come back out
  // byte-identical or the favicon silently drifts from the icon set.
  rainbow: {
    name: 'Rainbow',
    group: 'Queer',
    hex: M,
    t: 'crown',
    use: 'Queer culture generally; the app icon.',
    l: [
      [
        'M 20 72 C 20 44 33 26 50 26 C 67 26 80 44 80 72 M 36 72 C 36 54 41 42 50 42 C 59 42 64 54 64 72',
        null,
        2.2,
      ],
      [
        'M 20 72 C 20 44 33 26 50 26 C 67 26 80 44 80 72 M 36 72 C 36 54 41 42 50 42 C 59 42 64 54 64 72',
        'T',
        1.1,
      ],
    ],
  },

  // ── Safety ───────────────────────────────────────────────────────────────
  // `t: 'none'`, and that is a rule rather than a preference: §5 reserves the
  // empty tick set for calm and sensitive content, and aftercare is the most
  // sensitive thing in the Kink/Safety groups. Ticks would make it jaunty.
  aftercare: {
    name: 'Aftercare',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Aftercare guidance and post-scene support.',
    f: [
      [
        'M 50 62 C 38 52 32 45 32 38 C 32 31 37 27 43 27 C 46 27 50 29 50 33 C 50 29 54 27 57 27 C 63 27 68 31 68 38 C 68 45 62 52 50 62 Z',
        'T',
      ],
    ],
    l: ['M 22 72 C 32 79 68 79 78 72'],
  },

  // ── Intimacy gear and toys (ported from v1, 2026-10-10 wave) ─────────────
  // §7.2 governs every mark here: gear, symbols and safety — never bodies,
  // never acts. Each one is a line drawing with a station ring, so each takes
  // its colour from the base-weight tint rather than a fill; widening them to
  // the 2.2x strap closes every one of these station rings solid.
  'toy-dildo': {
    name: 'Dildo',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Dildos and insertable toys.',
    l: [
      ...tinted(
        `M 36 62 C 35 50 35 38 36 30 C 37 21 42 16 50 16 C 58 16 63 21 64 30 C 65 38 65 50 64 62 M 26 74 C 34 66 66 66 74 74 ${ring(50, 80, 7)}`,
      ),
    ],
  },

  'toy-plug': {
    name: 'Plug',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Plugs and anal toys.',
    f: [
      [
        'M 50 18 C 44 26 40 35 40 44 C 40 52 44 57 50 57 C 56 57 60 52 60 44 C 60 35 56 26 50 18 Z',
        'T',
      ],
    ],
    l: ['M 50 57 C 49 62 49 66 50 69', 'M 32 80 C 44 75 56 75 68 80', ring(50, 69, 6)],
  },

  'toy-stroker': {
    name: 'Stroker',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Strokers and masturbation sleeves.',
    f: [
      [
        'M 32 28 C 44 25 56 25 68 28 C 70 44 70 60 68 76 C 56 79 44 79 32 76 C 30 60 30 44 32 28 Z',
        'T',
      ],
    ],
    l: ['M 32 28 C 44 33 56 33 68 28', ring(50, 52, 7)],
  },

  'toy-vibrator': {
    name: 'Vibrator',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Vibrators and powered toys.',
    f: [
      [
        'M 42 72 C 41 58 41 40 42 30 C 43 22 46 18 50 18 C 54 18 57 22 58 30 C 59 40 59 58 58 72 C 54 76 46 76 42 72 Z',
        'T',
      ],
    ],
    l: ['M 24 32 C 16 42 16 58 24 68', 'M 76 32 C 84 42 84 58 76 68', ring(50, 50, 6)],
  },

  'toy-cockring': {
    name: 'Cockring',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Cockrings and constriction toys.',
    f: [
      [
        'M 50 76 C 33 76 22 65 22 50 C 22 35 33 24 50 24 C 67 24 78 35 78 50 C 78 65 67 76 50 76 Z',
        'T',
      ],
      [ring(50, 50, 8), 'P'],
    ],
  },

  'toy-chastity': {
    name: 'Chastity',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Chastity cages and devices.',
    l: [
      ...tinted(
        `M 36 30 C 34 44 34 58 38 70 C 44 76 56 76 62 70 C 66 58 66 44 64 30 M 36 40 C 45 37 55 37 64 40 M 36 52 C 45 49 55 49 64 52 M 37 63 C 45 60 55 60 63 63 ${ring(50, 26, 8)}`,
      ),
    ],
  },

  'toy-pump': {
    name: 'Pump',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Pumps and suction toys.',
    f: [
      [
        'M 36 34 C 35 48 35 62 36 74 C 44 78 56 78 64 74 C 65 62 65 48 64 34 C 56 31 44 31 36 34 Z',
        'T',
      ],
    ],
    l: ['M 50 31 C 51 26 51 22 50 18', 'M 50 18 C 59 18 67 22 73 29', ring(50, 54, 7)],
  },

  'toy-lube': {
    name: 'Lube',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Lubricant and personal lubricants.',
    f: [
      [
        'M 40 40 C 39 54 39 68 40 80 C 47 82 53 82 60 80 C 61 68 61 54 60 40 C 53 38 47 38 40 40 Z',
        'T',
      ],
    ],
    l: [
      'M 45 38 C 46.5 33.1 46.5 29.1 46 26 C 50 25 54 25 56 26',
      'M 56 26 C 61 24 65 22 69 22',
      ring(50, 58, 7),
    ],
  },

  'toy-poppers': {
    name: 'Poppers',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Poppers and inhalants.',
    f: [
      [
        'M 38 44 C 37 58 37 70 38 80 C 46 82 54 82 62 80 C 63 70 63 58 62 44 C 54 42 46 42 38 44 Z',
        'T',
      ],
    ],
    l: [
      'M 43 42 C 44.5 34.1 44.5 28.1 44 24 C 50 22 56 23 57 24 C 56.5 28.1 56.5 35.1 58 42',
      ring(50, 62, 7),
    ],
  },

  // A rolled condom in profile — reservoir tip over the ring. Drawn as a
  // packet first, which rendered as a CAMERA: a rounded rectangle with a
  // centred ring is a lens, and no amount of tear-edge detail beat that read.
  'toy-condom': {
    name: 'Condom',
    group: 'Market',
    hex: G,
    t: 'none',
    use: 'Condoms and barrier protection.',
    f: [
      [
        'M 50 20 C 46 20 44 24 44 28 C 44 32 42 35 38 37 C 30 41 26 49 26 57 C 26 70 36 80 50 80 C 64 80 74 70 74 57 C 74 49 70 41 62 37 C 58 35 56 32 56 28 C 56 24 54 20 50 20 Z',
        'T',
      ],
      [ring(50, 57, 12), 'P'],
    ],
  },

  // A boot. `fetish_gear`'s fine buckets are latex / leather / rubber-neoprene
  // / uniforms, i.e. the group is about GARMENT MATERIAL, so the mark is a
  // garment. First drawn as a buckled strap, which at this stroke weight was
  // an unreadable flat lozenge with a dot in it.
  'gear-fetish': {
    name: 'Fetish gear',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Latex, leather, rubber and uniform gear.',
    // NO STATION DOT. The boot's shaft leaves ~11 units of clear interior once
    // its own outline is drawn, and the counter floor is 16 wide plus a stroke,
    // so an open hole does not fit at any centre. At r=7 it did not render as a
    // hole at all — §8 says simplify what you cannot read, and the silhouette
    // is what names this icon anyway.
    f: [
      [
        'M 36 18 C 35 32 35 46 36 58 C 36 70 42 76 52 78 C 62 80 72 80 80 78 C 82 74 82 70 80 66 C 72 64 66 60 62 54 C 60 44 60 30 60 18 C 52 16 44 16 36 18 Z',
        'T',
      ],
    ],
  },

  'gear-harness': {
    name: 'Harness',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Harnesses and body gear.',
    l: [
      ...tinted(
        `M 22 22 C 34 32 42 40 44 46 M 78 22 C 66 32 58 40 56 46 M 22 78 C 34 68 42 60 44 54 M 78 78 C 66 68 58 60 56 54 ${ring(50, 50, 10)}`,
      ),
    ],
  },

  // Ball between two straps. The strap was first drawn as a lens ENVELOPE
  // around the ball; at stroke-width 9 the two merged into a flat eye and the
  // ball stopped reading as a ball. Straps now stop at the ball's edge.
  'gear-gag': {
    name: 'Gag',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Gags and mouth gear.',
    f: [[ring(50, 50, 14), 'T']],
    l: [
      'M 14 44 C 13 50 13 54 14 60',
      'M 86 44 C 87 50 87 54 86 60',
      'M 14 50 C 21 46 28 45 34 47',
      'M 86 50 C 78.2 46.5 72.2 45.5 66 47',
    ],
  },

  'gear-hood': {
    name: 'Hood',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Hoods, masks and sensory deprivation gear.',
    f: [
      [
        'M 50 18 C 36 18 28 28 28 44 C 28 60 36 76 50 82 C 64 76 72 60 72 44 C 72 28 64 18 50 18 Z',
        'T',
      ],
    ],
    l: ['M 38 44 C 42 42 46 42 50 44', 'M 62 44 C 58 42 54 42 50 44', ring(50, 62, 6)],
  },

  'gear-pup': {
    name: 'Pup hood',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Pup play hoods and petplay gear.',
    f: [
      [
        'M 50 28 C 36 28 28 38 28 50 C 28 64 38 76 50 80 C 62 76 72 64 72 50 C 72 38 64 28 50 28 Z',
        'T',
      ],
    ],
    l: [
      'M 31 34 C 26 24 30 18 38 20 C 42 22 44 26 46 30',
      'M 69 34 C 74 24 70 18 62 20 C 58 22 56 26 54 30',
      ring(50, 58, 7),
    ],
  },

  // ── Health stops (glossary glyph pass) ───────────────────────────────────
  // Both join the roundel family (`health`, `hours`, `compass`, `consent`,
  // `add-station`, `info-point`): the roundel is the house way of saying
  // "service / station", which is what a health resource is.

  // A capsule lying DIAGONALLY across the roundel. Deliberately NOT a
  // crossed-out pill: a slash reads as prohibition, which inverts the politics
  // of harm-reduction content and would be the worst mark on the site. The
  // diagonal is load-bearing, not styling — a VERTICAL capsule is `info-point`
  // with its dot swallowed.
  'harm-reduction': {
    name: 'Harm reduction',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Harm reduction, drug checking and safer use.',
    f: [[ring(50, 50, 34), 'T']],
    // A PAPER capsule with an ink casing, not an ink bar. As a single thick ink
    // stroke this was a solid diagonal across a roundel — a PROHIBITION SLASH,
    // which is the exact read this mark's author rejected, because crossing out
    // a pill inverts the politics of harm-reduction content. The paper core is
    // what turns the bar back into a pill.
    l: [
      ['M 34 61 C 42.8 57.2 58.8 45.2 66 39', null, 2.4],
      ['M 34 61 C 42.8 57.2 58.8 45.2 66 39', 'P', 1.3],
    ],
  },

  // A belly curve spanning the roundel nearly wall to wall. The near miss is
  // `consent` (roundel + one angular stroke at the same scale), so the
  // mitigation is structural: `consent`'s check is a narrow V parked low and
  // left, this is a wide shallow arc crossing the full width.
  'body-health': {
    name: 'Body health',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Body and reproductive health resources.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 26 42 C 36 70 64 70 74 42'],
  },
} satisfies Record<string, IconDef>;

/** Every icon slug in the set, as a literal union. */
export type IconName = keyof typeof DEFS;

export const ICON_DEFS: Record<IconName, IconDef> = DEFS;

/**
 * The flattened ink-only path for one icon: every distinct path it draws, in
 * order, deduplicated.
 *
 * Deduplication is what makes the ink-under / colour-over stroke pair collapse
 * back to one copy — a line drawing stores the same `d` twice, and emitting it
 * twice would double-stroke the monochrome rendition and break the byte
 * comparison `brandAssetSync.test.ts` makes against `public/favicon.svg`.
 *
 * It lives here rather than beside the renderer because it is a derivation of
 * the DATA, and because `transitIconPaths.ts` needs it: putting it in
 * `TransitIcon.tsx` makes that import cycle back through the component.
 */
export function inkPathOf(def: IconDef): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (d: string) => {
    if (seen.has(d)) return;
    seen.add(d);
    out.push(d);
  };
  for (const [d] of def.f ?? []) take(d);
  for (const s of def.l ?? []) take(typeof s === 'string' ? s : s[0]);
  return out.join(' ');
}

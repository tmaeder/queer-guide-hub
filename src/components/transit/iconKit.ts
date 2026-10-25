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

/**
 * A closed shape: the path, what goes inside the ink outline, and optionally
 * how heavy that outline is as a fraction of the base weight.
 *
 * The third element exists for ONE shape and the arithmetic is why. `pride`
 * is four stacked bands; the flag is 60 units tall, so a band is 15 and the
 * outline is up to 13 of them. Every band therefore rendered as two ink rules
 * with two units of colour trapped between, which is the "muddy scribble"
 * reading. An outline weight of 0 lets a band be pure colour and lets ONE
 * silhouette carry the keyline for all four -- the same per-shape weight
 * `Stroke` has always had, for the same reason.
 */
export type FilledShape = [d: string, fill: FillKind, outline?: number];

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
export const colored = (d: string): Stroke[] => [
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
export const tinted = (d: string): Stroke[] => [
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

/**
 * Rotate a path a quarter turn clockwise about the 50,50 centre, `turns` times.
 *
 * For drawing a family from one master (arrows, chevrons) so the four
 * directions cannot drift apart. Handles exactly the commands this set uses:
 * absolute M / C / Z and the relative `a` that `ring()` emits.
 */
export function rot(d: string, turns = 1): string {
  const t = ((turns % 4) + 4) % 4;
  const turn = (p: [number, number], absolute: boolean): [number, number] => {
    let q = p;
    for (let i = 0; i < t; i++) q = absolute ? [100 - q[1], q[0]] : [-q[1], q[0]];
    return q;
  };
  return transformPath(d, (x, y) => turn([x, y], true), (x, y) => turn([x, y], false), false);
}

/** Mirror a path left-to-right about x = 50. Same command coverage as `rot`. */
export function flipX(d: string): string {
  return transformPath(d, (x, y) => [100 - x, y], (x, y) => [-x, y], true);
}

function transformPath(
  d: string,
  abs: (x: number, y: number) => [number, number],
  rel: (x: number, y: number) => [number, number],
  mirror: boolean,
): string {
  const tokens = d.trim().split(/[\s,]+/);
  const out: string[] = [];
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  let cmd = '';
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
      out.push(cmd);
      if (cmd === 'Z' || cmd === 'z') continue;
    }
    if (cmd === 'M' || cmd === 'C') {
      const [x, y] = abs(num(), num());
      out.push(fmt(x), fmt(y));
    } else if (cmd === 'a') {
      const [rx, ry, xr, large, sweep] = [num(), num(), num(), num(), num()];
      const [dx, dy] = rel(num(), num());
      out.push(fmt(rx), fmt(ry), fmt(xr), String(large), String(mirror ? 1 - sweep : sweep), fmt(dx), fmt(dy));
    } else {
      throw new Error(`rot/flipX: unsupported command ${cmd}`);
    }
  }
  return out.join(' ');
}

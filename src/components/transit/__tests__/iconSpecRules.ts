/** Mechanical half of the Icon System v2 spec, as checkable predicates.
 *
 *  The spec (§1-§7) is partly mechanical and partly editorial. This file owns
 *  ONLY the mechanical half — what a parser can decide without looking at the
 *  drawing. §8 (the legibility test: "can you name it at 24px?", "concentric
 *  shapes read as a target", "a blob with a stick reads as nothing") is a human
 *  pass and is deliberately NOT faked here: a green run means the data is
 *  well-formed, never that the icons are legible.
 *
 *  It lives under __tests__/ rather than in src/ proper because it is a
 *  dev-time check that ships to nobody, and because that path is exempt from
 *  the colour-literal ESLint rule it has to quote hex values to assert.
 */

/** The group and tick vocabularies are DATA, not test fixtures, so they are
 *  imported rather than restated here. Restating them is how a rules file ends
 *  up validating against a vocabulary the icons no longer use — the check goes
 *  green while the thing it checks has moved. */
export { ICON_GROUPS, TICK_SETS } from '../iconDefs';

/** §4b. One track colour per icon. `Pride` is the only icon allowed to carry
 *  several, and the spec says nothing else may join it — so the exemption is a
 *  frozen single-member list rather than a flag any icon could set. */
export const MULTI_TRACK_EXEMPT = ['Pride'] as const;

/** §3. The body lives between 12 and 88. */
export const BODY_MIN = 12;
export const BODY_MAX = 88;
/** §3. Motion ticks live in the margin; thin tails may reach 92. */
export const BLEED_MIN = 0;
export const BLEED_MAX = 100;
export const TAIL_MAX = 92;
/**
 * The widest stroke the renderer ever draws an outline at, in path units.
 *
 * IMPORTED, never restated. This was written down as a literal once and went
 * stale within the hour: the ramp moved 9/10/11 -> 9/11/13 and this constant
 * stayed at 11, so every floor below was computed against a stroke two units
 * thinner than the one being drawn — while the test it feeds stayed green.
 */
export { MAX_STROKE_WIDTH as MAX_SW } from '../iconDefs';
import { MAX_STROKE_WIDTH } from '../iconDefs';

/**
 * §3. A paper hole smaller than this fills in at small sizes.
 *
 * THE SPEC SAYS 5 AND 5 DOES NOT SURVIVE THE SPEC'S OWN STROKE WEIGHT. An
 * outline straddles its path, taking `MAX_SW / 2` off each side, so a counter
 * of radius r has `2r - MAX_SW` units of visible hole — at r=5 that is
 * 10 - 12.8, i.e. negative, and the counter renders as solid ink. Measured on
 * the pilot sheet: r=8 (`near-you`) is a clean hole, r=7 (`events`) is a tight
 * but legible one, and the first draft of `pride` proved the negative case by
 * rendering a solid black blob.
 *
 * The floor is the radius that leaves ~3 units of hole, not the stated 5, and
 * the 3 is measured rather than chosen. On the contact sheet at the small-size
 * stroke: r=8 (3 units) holds an open hole at 16/24/32px on `near-you`,
 * `toy-cockring` and `toy-condom`; r=7 (1 unit) does not — `events` closed to a
 * dark smudge and `gear-fetish`'s counter vanished entirely.
 *
 * A ONE-UNIT FLOOR WAS GREEN OVER BOTH OF THEM. The arithmetic said "positive,
 * therefore open", which is true and useless: the question is whether a reader
 * sees a hole, and that is answered on the sheet, not by the sign of a
 * subtraction.
 */
export const MIN_COUNTER_R = Math.ceil((MAX_STROKE_WIDTH + 3) / 2);

/**
 * Minimum pitch for a band in a stack of filled shapes, same arithmetic: a
 * band of height h shows `h - MAX_SW` units of colour. 16 leaves ~3.
 *
 * NOT mechanically enforced, and the honesty matters more than the rule: a
 * thin band's BOUNDING BOX is wide, so no bbox test can see it. Catching it in
 * general needs medial-axis analysis of the filled region. It is listed in the
 * §8 human checklist in docs/design-system/README.md instead, and `pride`'s
 * comment carries the worked example.
 */
export const MIN_FILL_PITCH = Math.ceil(MAX_STROKE_WIDTH + 3);

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Path commands §4 permits: cubics, quadratics, moves, closes, and the `a`
 *  arcs `ring()` emits. Everything else — notably `L H V` and their relative
 *  twins — is a straight segment, which this brand does not draw. */
const ALLOWED_COMMANDS = new Set(['M', 'C', 'Q', 'Z', 'z', 'a']);

const TOKENS = /[A-Za-z]|-?\d+(?:\.\d+)?/g;

/** Every alphabetic command letter in a path, in order. */
export function commandsOf(d: string): string[] {
  return Array.from(d.matchAll(/[A-Za-z]/g), (m) => m[0]);
}

/** §4: the commands a path uses that the spec forbids. Empty = compliant.
 *  Returned rather than booleaned so a failure can name the offender. */
export function forbiddenCommands(d: string): string[] {
  return [...new Set(commandsOf(d).filter((c) => !ALLOWED_COMMANDS.has(c)))];
}

/**
 * Bounding box of a path.
 *
 * Control points are included rather than solved for, so the box is a superset
 * of the true curve — which is the safe direction for a bounds check: it can
 * report a body that is inside the box as outside, never the reverse. The
 * alternative (solving each cubic for its extrema) would let a control point
 * sit far outside 12-88 while the curve stayed in, and the spec's intent is
 * that the DRAWING, control points included, stays off the margin reserved for
 * ticks.
 *
 * `a` is handled for the shape `ring()` actually emits — a pair of semicircles
 * whose chord is a diameter — by taking the chord midpoint as the centre and
 * adding centre±r. For a semicircle that is exact.
 */
export function bbox(d: string): Box {
  const toks = d.match(TOKENS) ?? [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = '';
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (px: number, py: number) => {
    box.minX = Math.min(box.minX, px);
    box.minY = Math.min(box.minY, py);
    box.maxX = Math.max(box.maxX, px);
    box.maxY = Math.max(box.maxY, py);
  };
  const num = () => Number(toks[i++]);

  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    switch (cmd) {
      case 'M':
        x = num();
        y = num();
        startX = x;
        startY = y;
        add(x, y);
        break;
      case 'C': {
        const c1x = num();
        const c1y = num();
        const c2x = num();
        const c2y = num();
        x = num();
        y = num();
        add(c1x, c1y);
        add(c2x, c2y);
        add(x, y);
        break;
      }
      case 'Q': {
        const cx = num();
        const cy = num();
        x = num();
        y = num();
        add(cx, cy);
        add(x, y);
        break;
      }
      case 'a': {
        const rx = num();
        const ry = num();
        num(); // x-axis rotation
        num(); // large-arc flag
        num(); // sweep flag
        const endX = x + num();
        const endY = y + num();
        const cx = (x + endX) / 2;
        const cy = (y + endY) / 2;
        add(cx - rx, cy - ry);
        add(cx + rx, cy + ry);
        x = endX;
        y = endY;
        break;
      }
      case 'Z':
      case 'z':
        x = startX;
        y = startY;
        break;
      default:
        // Unknown command: consume one token so a malformed path cannot spin
        // here forever. `forbiddenCommands` is what reports it.
        i++;
    }
  }
  return box;
}

/** True when the whole box sits within [min, max] on both axes. */
export function within(box: Box, min: number, max: number): boolean {
  return box.minX >= min && box.minY >= min && box.maxX <= max && box.maxY <= max;
}

/** Every `ring(cx, cy, r)` radius in a path, read back off the emitted arc
 *  pair. `ring()` writes the radius twice per arc (rx and ry), so the first
 *  number after each `a` is the radius. */
export function ringRadii(d: string): number[] {
  return Array.from(d.matchAll(/a\s+(-?\d+(?:\.\d+)?)/g), (m) => Number(m[1]));
}

/** §9/§7.6. One sentence, 12 words or fewer, written for a designer. */
export function checkUseLine(use: string): string[] {
  const problems: string[] = [];
  const words = use.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) problems.push('empty');
  if (words.length > 12) problems.push(`${words.length} words (max 12)`);
  if (!/[.!?]$/.test(use.trim())) problems.push('not a sentence (no terminal period)');
  if (/^[a-z]/.test(use.trim())) problems.push('does not start with a capital');
  return problems;
}

/** §9. Title case, 1-3 words. Checked because `name` is the sheet's identity
 *  and the thing §8.7 asks you to compare a new icon against. */
export function nameProblems(name: string): string[] {
  const problems: string[] = [];
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) problems.push('empty');
  if (words.length > 3) problems.push(`${words.length} words (max 3)`);
  // Title case here means "the first word is capitalised", not "every word is"
  // — "Sober space" and "Food bank" are the spec's own examples, and both
  // lower-case the second word.
  if (!/^[A-Z0-9]/.test(name.trim())) problems.push('first word not capitalised');
  return problems;
}

/**
 * §4. How far a cubic's control points must sit off the chord before the curve
 * counts as a curve.
 *
 * The spec says "about 2 units"; this demands 1, so a gentle bow passes and
 * only a segment that is flat to within a unit fails. Required of ONE control
 * point, not both — plenty of honest curves park one control on the chord and
 * bend with the other.
 */
export const MIN_BOW = 1;

/** Perpendicular distance from `p` to the line through `a` and `b`. */
function offChord(
  [px, py]: [number, number],
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  // A zero-length chord is a closed loop back to the start; any control point
  // off the start point is a real curve, so measure from the point itself.
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
}

/**
 * §4: cubics whose control points lie on their own chord — a straight line
 * written as a curve.
 *
 * THIS IS THE CHECK `forbiddenCommands` CANNOT MAKE, and the gap is not
 * academic. Counting `L H V` reported four offending glyphs in v1; counting
 * flat cubics as well reports many more, because a run like
 * `C 50 45 50 55 50 64` holds x at 50 the whole way and is as straight as
 * `V 64` while passing every command-letter test. Measuring the letters and
 * calling the set curve-only is the under-measurement that hid them.
 *
 * Returns one entry per flat segment, as `"<startIndex>: <d-fragment>"`.
 */
export function flatCubics(d: string): string[] {
  const toks = d.match(TOKENS) ?? [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = '';
  let seg = 0;
  const flat: string[] = [];
  const num = () => Number(toks[i++]);

  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    switch (cmd) {
      case 'M':
        x = num();
        y = num();
        startX = x;
        startY = y;
        break;
      case 'C': {
        const c1: [number, number] = [num(), num()];
        const c2: [number, number] = [num(), num()];
        const a: [number, number] = [x, y];
        const b: [number, number] = [num(), num()];
        seg += 1;
        if (offChord(c1, a, b) < MIN_BOW && offChord(c2, a, b) < MIN_BOW)
          flat.push(`seg ${seg}: C ${c1.join(' ')} ${c2.join(' ')} ${b.join(' ')}`);
        [x, y] = b;
        break;
      }
      case 'Q': {
        const c: [number, number] = [num(), num()];
        const a: [number, number] = [x, y];
        const b: [number, number] = [num(), num()];
        seg += 1;
        if (offChord(c, a, b) < MIN_BOW) flat.push(`seg ${seg}: Q ${c.join(' ')} ${b.join(' ')}`);
        [x, y] = b;
        break;
      }
      case 'a': {
        num();
        num();
        num();
        num();
        num();
        x += num();
        y += num();
        break;
      }
      case 'Z':
      case 'z':
        x = startX;
        y = startY;
        break;
      default:
        i++;
    }
  }
  return flat;
}

/** §7.5. No text, letters or numbers inside an icon. A path cannot carry a
 *  glyph, so this is about the data staying path-shaped: the only way to smuggle
 *  type in is a `text` element, which the format has no slot for. Kept as a
 *  predicate anyway so the rule is enforced rather than merely written down. */
export function containsMarkup(d: string): boolean {
  return /<|&[a-z]+;/i.test(d);
}

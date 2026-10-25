import { describe, expect, it } from 'vitest';
import {
  ICON_DEFS,
  TICKS,
  M,
  C,
  G,
  Y,
  type FilledShape,
  type IconName,
  type Stroke,
} from '../iconDefs';
import {
  BLEED_MAX,
  BLEED_MIN,
  BODY_MAX,
  BODY_MIN,
  ICON_GROUPS,
  MIN_COUNTER_R,
  MULTI_TRACK_EXEMPT,
  TAIL_MAX,
  TICK_SETS,
  bbox,
  containsMarkup,
  flatCubics,
  forbiddenCommands,
  nameProblems,
  ringRadii,
  checkUseLine,
  within,
} from './iconSpecRules';

/**
 * The mechanical half of the Icon System v2 spec, enforced over the real data.
 *
 * WHAT A GREEN RUN DOES NOT MEAN. §8 is a legibility test — "if you can't name
 * it at 24px, simplify it", "concentric shapes read as a target", "a blob with
 * a stick reads as nothing" — and no assertion here can decide any of it. That
 * pass is a human with the contact sheet:
 *
 *     npx tsx --tsconfig tsconfig.app.json scripts/render-icon-sheet.mjs out.html
 *
 * Both halves are needed. This file caught a flag whose bands were drawn
 * outside the body box; the sheet caught the same flag rendering as a solid
 * black blob, which no predicate here would ever have seen.
 */

// Typed, because `Object.entries` widens the key to `string` and the record is
// keyed by a literal union — indexing it back with a `string` is an implicit
// `any`, which the zero-new-errors typecheck ratchet rejects.
const entries = Object.entries(ICON_DEFS) as [IconName, (typeof ICON_DEFS)[IconName]][];
const TRACKS: string[] = [M, C, G, Y];

/** Every path string an icon draws, fills and strokes together. */
function pathsOf(slug: IconName): { where: string; d: string }[] {
  const def = ICON_DEFS[slug];
  const out: { where: string; d: string }[] = [];
  (def.f ?? []).forEach(([d]: FilledShape, i: number) => out.push({ where: `f[${i}]`, d }));
  (def.l ?? []).forEach((s: Stroke, i: number) =>
    out.push({ where: `l[${i}]`, d: typeof s === 'string' ? s : s[0] }),
  );
  return out;
}

describe('Icon System v2 — spec compliance', () => {
  // A positive control. Every assertion below is a loop over `entries`, and a
  // loop over an empty or truncated set passes while checking nothing — which
  // is the failure mode that makes a whole test file decorative. The count is
  // exact on purpose: 42 wayfinding icons from the subway rebrand, 10 venue
  // glyphs so the map could drop lucide from its pins, 7 marketplace
  // department glyphs so department tiles could stop using a product photo as
  // category art, and 28 marketplace category glyphs so a category tile's
  // icon names its own title rather than its department's.
  it('covers the whole set', () => {
    expect(entries).toHaveLength(104);
    expect(entries.length).toBeGreaterThan(0);
  });

  describe('§4 curves only', () => {
    it('uses no straight segments anywhere', () => {
      const offenders: string[] = [];
      for (const [slug] of entries) {
        for (const { where, d } of pathsOf(slug)) {
          const bad = forbiddenCommands(d);
          if (bad.length) offenders.push(`${slug} ${where}: ${bad.join(' ')}`);
        }
      }
      // `L H V` and their relative twins draw a dead-straight segment, which is
      // the one thing this brand's geometry never does. v1 had four glyphs
      // carrying them — events, ticket, map and march — and all four are
      // cubics bowed ~1 unit off the chord now.
      expect(offenders).toEqual([]);
    });

    it('bends every cubic it draws', () => {
      const offenders: string[] = [];
      for (const [slug] of entries)
        for (const { where, d } of pathsOf(slug))
          for (const flat of flatCubics(d)) offenders.push(`${slug} ${where} ${flat}`);
      // A cubic whose control points sit on its own chord is a straight line
      // wearing a curve's command letter. Counting `L H V` alone reported four
      // offending glyphs in v1 and missed every one of these.
      expect(offenders).toEqual([]);
    });

    it('bends every motion tick too', () => {
      for (const [set, paths] of Object.entries(TICKS))
        for (const d of paths) expect(flatCubics(d), `${set}: ${d}`).toEqual([]);
    });

    it('carries no markup in any path', () => {
      for (const [slug] of entries)
        for (const { where, d } of pathsOf(slug))
          expect(containsMarkup(d), `${slug} ${where}`).toBe(false);
    });
  });

  describe('§3 the grid', () => {
    it('keeps every body inside 12-88', () => {
      const offenders: string[] = [];
      for (const [slug] of entries) {
        for (const { where, d } of pathsOf(slug)) {
          const box = bbox(d);
          if (!within(box, BODY_MIN, BODY_MAX))
            offenders.push(
              `${slug} ${where}: x ${box.minX}..${box.maxX} y ${box.minY}..${box.maxY}`,
            );
        }
      }
      // The margin outside this box is reserved for motion ticks. A body that
      // reaches into it collides with its own ticks at 32px and up.
      expect(offenders).toEqual([]);
    });

    it('keeps every motion tick in the margin and out of the body', () => {
      for (const [set, paths] of Object.entries(TICKS)) {
        for (const d of paths) {
          const box = bbox(d);
          expect(within(box, BLEED_MIN, BLEED_MAX), `${set} within the bleed`).toBe(true);
          // Each tick must lie wholly outside the body box on at least one
          // axis, or it is drawing rather than motion.
          const clearsBody =
            box.maxX <= BODY_MIN ||
            box.minX >= BODY_MAX ||
            box.maxY <= BODY_MIN ||
            box.minY >= BODY_MAX;
          expect(clearsBody, `${set} tick ${d} overlaps the body box`).toBe(true);
        }
      }
    });

    it('never cuts a counter too small to stay open', () => {
      const offenders: string[] = [];
      for (const [slug, def] of entries)
        for (const [d, fill] of def.f ?? [])
          if (fill === 'P')
            for (const r of ringRadii(d))
              if (r < MIN_COUNTER_R) offenders.push(`${slug}: paper ring r=${r}`);
      // A paper hole has `2r - strokeWidth` units of visible opening. The spec
      // text says radius 5, which at this stroke weight is a NEGATIVE opening
      // and renders as solid ink — see MIN_COUNTER_R for the measurement.
      // Anything below the real floor belongs in `l` as an ink dot instead.
      expect(offenders).toEqual([]);
    });

    it('never lets a tail run past 92', () => {
      for (const [slug] of entries)
        for (const { where, d } of pathsOf(slug)) {
          const box = bbox(d);
          expect(Math.max(box.maxX, box.maxY), `${slug} ${where}`).toBeLessThanOrEqual(TAIL_MAX);
        }
    });
  });

  describe('§4b colour', () => {
    it('gives every icon exactly one track colour', () => {
      for (const [slug, def] of entries) expect(TRACKS, slug).toContain(def.hex);
    });

    it('lets only Pride carry several tracks', () => {
      const literal: string[] = [];
      for (const [, def] of entries) {
        const used = [
          ...(def.f ?? []).map(([, fill]) => fill),
          ...(def.l ?? []).map((s: Stroke) => (typeof s === 'string' ? null : s[1])),
        ];
        if (used.some((v) => typeof v === 'string' && TRACKS.includes(v))) literal.push(def.name);
      }
      // A literal track colour is how an icon escapes "one colour per icon".
      // The spec grants that to Pride and says nothing else may join it, so the
      // exemption is asserted as an exact set — a second icon copying the
      // pattern fails here rather than quietly spreading it.
      expect(literal).toEqual([...MULTI_TRACK_EXEMPT]);
    });

    it('never puts a bare track colour on an un-cased stroke', () => {
      for (const [slug, def] of entries) {
        const strokes = def.l ?? [];
        strokes.forEach((s: Stroke, i) => {
          if (typeof s === 'string') return;
          const [d, color] = s;
          if (color === null) return;
          // §4b: colour sits inside an ink outline, never as one. The single
          // exception is a coloured stroke that has an ink stroke underneath,
          // so a coloured stroke must be paired with an ink stroke on the
          // SAME path — otherwise the colour is acting as the outline.
          const cased = strokes.some(
            (o: Stroke) => typeof o !== 'string' && o[0] === d && o[1] === null,
          );
          expect(cased, `${slug} l[${i}] is coloured but has no ink stroke under it`).toBe(true);
        });
      }
    });
  });

  describe('§5 motion ticks', () => {
    it('picks a tick set from the vocabulary', () => {
      for (const [slug, def] of entries) expect(TICK_SETS, slug).toContain(def.t);
    });

    it('has geometry for every set an icon names', () => {
      for (const [slug, def] of entries)
        if (def.t !== 'none') expect(TICKS[def.t], slug).toBeTruthy();
    });

    it('keeps every tick set to between 2 and 4 strokes', () => {
      for (const [set, paths] of Object.entries(TICKS)) {
        expect(paths.length, set).toBeGreaterThanOrEqual(2);
        expect(paths.length, set).toBeLessThanOrEqual(4);
      }
    });

    it('leaves the calm and sensitive icons silent', () => {
      // Not a stylistic preference: §5 reserves `none` for calm or sensitive
      // content, and these are the rows in this set that qualify. Named
      // explicitly so a later author cannot make aftercare jaunty by accident.
      for (const slug of ['aftercare', 'rope-play', 'safeword'] as IconName[])
        expect(ICON_DEFS[slug].t, slug).toBe('none');
    });
  });

  describe('§6 / §9 metadata', () => {
    it('files every icon under a real group', () => {
      for (const [slug, def] of entries) expect(ICON_GROUPS, slug).toContain(def.group);
    });

    it('gives every icon a unique Title Case name', () => {
      const names = entries.map(([, def]) => def.name);
      expect(new Set(names).size).toBe(names.length);
      for (const [slug, def] of entries) expect(nameProblems(def.name), slug).toEqual([]);
    });

    it('says when to use each icon in 12 words or fewer', () => {
      for (const [slug, def] of entries) expect(checkUseLine(def.use), slug).toEqual([]);
    });

    it('draws something for every icon', () => {
      // A def with neither fills nor strokes type-checks and renders an empty
      // box, which in the map's fail-soft rasteriser is indistinguishable from
      // a glyph that failed to load.
      for (const [slug, def] of entries)
        expect((def.f?.length ?? 0) + (def.l?.length ?? 0), slug).toBeGreaterThan(0);
    });
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The events timeline carried the same shape as the /pride timeline pins, which failed
// axe `target-size` (WCAG 2.2 AA, 2.5.8) at `serious` impact and were fixed in #4001:
//
//   HIT BOX   the pin's anchor was BAR_HEIGHT (18px) tall, under the 24x24 minimum.
//   OVERFLOW  the label pin's `maxWidth` was `LABEL_PX + 16` (126px) while
//             `placeOnRows` reserved only `LABEL_PX` (110px), so a label wider than
//             110px overflowed into its neighbour and stole its clicks.
//   CHIP      the cluster chip is a bare <button> with `rounded-full` and no
//             `min-h-0`, so `@layer base`'s `min-height: 44px` beat its inline
//             `height: 18px` — it rendered as a 44px-tall pill in a 30px row while
//             measuring 18px wide, i.e. failing target-size on WIDTH.
//
// One difference from /pride is load-bearing and is what the bar-height mirror below
// guards: there the anchor was the ONLY user of the old height, so it could simply be
// raised. Here `BAR_HEIGHT` is ALSO the visible bar's own height, so raising it would
// make every bar 33% thicker. The anchor takes PIN_HEIGHT_PX, the bar keeps
// BAR_HEIGHT, and the anchor's top is offset by half the growth.
//
// This file pins the constants. The axe sweep is the real behavioural guard, but it
// only runs on PRs touching `e2e/**`, and the events timeline is not /events' default
// view so the sweep never reached it — which is why this component still had the
// defect after /pride was fixed.

const SRC = readFileSync(
  join(process.cwd(), 'src/components/events/EventsTimelineView.tsx'),
  'utf8',
);
const TOOLBAR = readFileSync(
  join(process.cwd(), 'src/components/events/TimelineToolbar.tsx'),
  'utf8',
);

// Comment-stripped: this component's header now explains the off-by-16, the 24px
// minimum and the min-height trap in prose, so a whole-file match would be satisfiable
// by the comments with the code reverted.
const code = SRC.split('\n')
  .filter(
    (l) =>
      !l.trimStart().startsWith('*') &&
      !l.trimStart().startsWith('/*') &&
      !l.trimStart().startsWith('//'),
  )
  .join('\n');

/** Both the pin anchor and the cluster chip must use the constant. */
const heightUses = () => (code.match(/height: `\$\{PIN_HEIGHT_PX\}px`/g) ?? []).length;

const num = (name: string): number | null => {
  const m = code.match(new RegExp(`const ${name} = (\\d+)`));
  return m ? Number(m[1]) : null;
};

describe('the events timeline pin is a legal touch target', () => {
  it('is at least 24px tall, the WCAG 2.5.8 minimum', () => {
    const h = num('PIN_HEIGHT_PX');
    expect(h).not.toBeNull();
    expect(h!).toBeGreaterThanOrEqual(24);
    // Counted, not matched. `height: ${PIN_HEIGHT_PX}px` occurs TWICE — the pin anchor
    // and the cluster chip — so a single-occurrence match is satisfied by the chip's
    // copy with the pin's reverted to BAR_HEIGHT. Mutation testing caught exactly that
    // here: reverting the pin's height alone SURVIVED the first draft of this file.
    expect(heightUses()).toBe(2);
  });

  it('grows about the old centre line, so no bar or label moves', () => {
    // The hit box was BAR_HEIGHT at `y`, centre y+9. Adding the 6px purely below
    // would shift every bar down 3px. The anchor is `flex items-center`, so an 18px
    // bar inside a 24px box still centres on y+9.
    expect(code).toMatch(/top: `\$\{y - \(PIN_HEIGHT_PX - BAR_HEIGHT\) \/ 2\}px`/);
  });

  it('fits inside the row pitch, so vertical neighbours cannot overlap', () => {
    expect(num('PIN_HEIGHT_PX')!).toBeLessThan(num('ROW_HEIGHT')!);
  });
});

describe('the VISIBLE bar is unchanged — only the hit box grew', () => {
  // The mirror assertion. Raising BAR_HEIGHT to 24 would satisfy every other test in
  // this file while making each bar a third thicker, which is a visible change to a
  // dense chart. Both halves are needed: the constant must stay 18 AND the bar must
  // still be the thing that uses it.
  it('keeps BAR_HEIGHT at its original 18px', () => {
    expect(num('BAR_HEIGHT')).toBe(18);
  });

  it('still draws the bar span at BAR_HEIGHT, not at the hit-box height', () => {
    expect(code).toMatch(/width: `\$\{widthPx\}px`, height: `\$\{BAR_HEIGHT\}px`/);
  });
});

describe('the label pin cannot overflow its row reservation', () => {
  it('caps maxWidth at the SAME constant placeOnRows reserves', () => {
    // The whole bug: these were 126 and 110. One constant must feed both.
    expect(code).toMatch(/maxWidth: isBar \? undefined : `\$\{LABEL_PX\}px`/);
    expect(code).not.toMatch(/maxWidth: [^\n]*LABEL_PX \+ \d+/);
  });

  it('passes that same constant as the packing reserve', () => {
    expect(code).toMatch(/placeOnRows\([\s\S]*?LABEL_PX,?\s*\)/);
  });

  it('keeps truncation on the LABEL pin, which is what makes the narrower cap safe', () => {
    // Scoped to the label span by its own content. `truncate` occurs five times in
    // this file — the bucket header, two popover list rows, the bar span and this —
    // so a whole-file match is satisfied by the other four with this one removed.
    expect(code).toMatch(/className="truncate">\{event\.title\}/);
  });

  it('leaves BARS uncapped, because their reservation already covers their width', () => {
    // placeOnRows reserves max(actualEnd, start + LABEL_PX), so a bar can never
    // overflow its row. Capping bars at LABEL_PX would instead truncate a long
    // multi-day event's own span, which is real information.
    expect(code).toMatch(/maxWidth: isBar \? undefined :/);
  });
});

describe('the cluster chip is a legal touch target', () => {
  it('opts out of the 44px base rule so its own size applies', () => {
    // Without min-h-0 the base `button { min-height: 44px }` beats the inline height
    // and the chip renders as a tall pill in a 30px row. `rounded-full` does not hit
    // the `rounded-badge` 24px exemption.
    expect(code).toMatch(/'absolute flex min-h-0 items-center justify-center/);
  });

  it('is at least 24px in BOTH axes', () => {
    // Width was max(18, 18 + (digits-1)*4) = 18px for a 3-9 count, the common case,
    // so it failed on width even while min-height accidentally covered the height.
    expect(code).toMatch(
      /width: `\$\{Math\.max\(PIN_HEIGHT_PX, BAR_HEIGHT \+ \(count\.toString\(\)\.length - 1\) \* 4\)\}px`/,
    );
    // Same counted form, for the same reason: the pin carries the other copy.
    expect(heightUses()).toBe(2);
  });

  it('sits on the same centre line as the bars', () => {
    const offsets = code.match(/top: `\$\{y - \(PIN_HEIGHT_PX - BAR_HEIGHT\) \/ 2\}px`/g) ?? [];
    // Both the chip and the pin: asserting one occurrence is satisfied by the other.
    expect(offsets.length).toBe(2);
  });
});

describe('dimmed text on the timeline meets AA contrast', () => {
  // Adding `/events?view=timeline` to the sweep manifest is what surfaced these: the
  // route had never been scanned, so 12 `color-contrast` (serious) instances sat there
  // invisibly. Measured by axe on this branch against the light theme:
  //
  //   text-foreground/40 on bg-surface-container … 2.54:1  (month chip, empty bucket)
  //   text-foreground/50 on the page             … 3.48:1  (viewport range, count, hint)
  //
  // Both are under the 4.5:1 AA threshold for 11px text. `text-muted-foreground`
  // (light `0 0% 33%` = #545454) computes to ~7.25:1 on the page and ~6.1:1 on
  // surface-container, so it clears AA on both grounds and keeps the palette
  // monochrome rather than inventing a new opacity.
  //
  // The ban is deliberately SPECIFIC to /40 and /50 rather than to every opacity:
  // /60 computes to 4.88:1 and /70 to 6.91:1, both of which pass, and several are
  // still in use. A blanket ban would force needless churn and would not be true.
  const files = { 'EventsTimelineView.tsx': code, 'TimelineToolbar.tsx': TOOLBAR };

  for (const [name, src] of Object.entries(files)) {
    it(`${name} uses no sub-AA text opacity`, () => {
      expect(src).not.toMatch(/text-foreground\/(40|50)\b/);
    });
  }

  it('still allows the opacities that do pass, so the rule is not a blanket ban', () => {
    // Positive control: if this stops matching, the assertion above has quietly become
    // "no dimmed text at all" and is no longer testing what it claims.
    expect(code).toMatch(/text-foreground\/(60|70)\b/);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The /pride timeline pins failed axe `target-size` (WCAG 2.2 AA, 2.5.8) at `serious`
// impact on both viewports: 61x20 and 98x20 where 24x24 is the minimum. The same sweep
// also caught a real click-stealing bug next to it — the pin's `maxWidth` was
// `LABEL_PX + 16` (112px) while `placeOnRows` reserved only `LABEL_PX` (96px) on the
// row, so a pin whose label rendered wider than 96px overflowed into its neighbour.
// Measured 2026-09-28: a 103px `CSD Görlitz` pin ending at x=1354 with the next pin
// starting at x=1353.
//
// Verified in a real browser against `vite preview` over all 393 rendered pins:
//   heights [24] · maxW 96 · overlaps 0 · minGap 1px · dot offset 12px from pin top
// and the full axe sweep went to critical=0 serious=0 moderate=0 minor=0 on 86 scans.
//
// This file pins the two constants that a future edit could quietly drift apart again.
// The axe sweep is the real behavioural guard, but it only runs on PRs touching
// `e2e/**`, so a change to this component alone would not re-run it.

const SRC = readFileSync(join(process.cwd(), 'src/components/pride/PrideTimeline.tsx'), 'utf8');

// Comment-stripped: this component's header explains the off-by-16 and the 24px
// minimum in prose, so a whole-file match would be satisfiable by the comments with
// the code reverted.
const code = SRC.split('\n')
  .filter(
    (l) =>
      !l.trimStart().startsWith('*') &&
      !l.trimStart().startsWith('/*') &&
      !l.trimStart().startsWith('//'),
  )
  .join('\n');

const num = (name: string): number | null => {
  const m = code.match(new RegExp(`const ${name} = (\\d+)`));
  return m ? Number(m[1]) : null;
};

describe('the /pride timeline pin is a legal touch target', () => {
  it('is at least 24px tall, the WCAG 2.5.8 minimum', () => {
    const h = num('PIN_HEIGHT_PX');
    expect(h).not.toBeNull();
    expect(h!).toBeGreaterThanOrEqual(24);
    // And the anchor actually uses it, rather than a literal that can drift.
    expect(code).toMatch(/height: `\$\{PIN_HEIGHT_PX\}px`/);
    expect(code).not.toMatch(/height: '20px'/);
  });

  it('grows about the old centre line, so no label moves', () => {
    // Adding the height purely below would shift every label down 2px. The offset is
    // what keeps the dot and text on the pixels they already occupied — measured at a
    // 12px dot offset inside a 24px pin, i.e. still centred on y+10.
    expect(code).toMatch(/top: `\$\{y - \(PIN_HEIGHT_PX - PIN_CONTENT_PX\) \/ 2\}px`/);
    expect(num('PIN_CONTENT_PX')).toBe(20);
  });

  it('fits inside the row pitch, so vertical neighbours cannot overlap', () => {
    const h = num('PIN_HEIGHT_PX')!;
    const row = num('ROW_HEIGHT')!;
    expect(row).toBeGreaterThan(h);
  });
});

describe('the pin cannot overflow its row reservation', () => {
  it('caps maxWidth at the SAME constant placeOnRows reserves', () => {
    // The whole bug: these were 112 and 96. One constant must feed both, or a pin
    // overflows into its neighbour and steals its clicks.
    expect(code).toMatch(/maxWidth: `\$\{LABEL_PX\}px`/);
    expect(code).not.toMatch(/maxWidth: `\$\{LABEL_PX \+ \d+\}px`/);
  });

  it('passes that same constant as the packing reserve', () => {
    expect(code).toMatch(/placeOnRows\([^)]*LABEL_PX\)/);
  });

  it('keeps truncation on the PIN label, which is what makes the narrower cap safe', () => {
    // Capping the pin rather than widening the reserve costs no extra rows, but only
    // works because the label truncates and the tooltip carries the full text.
    //
    // Scoped to the anchor. `className="truncate"` occurs three times in this file —
    // the pin label plus two rows of TooltipContent — so a whole-file match is
    // satisfied by the tooltip copies with the pin's removed. Mutation testing caught
    // exactly that here.
    const anchor = code.slice(0, code.indexOf('<TooltipContent'));
    expect(anchor).not.toBe('');
    expect(anchor).toMatch(/className="truncate"/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard on the borderless-surface rule in `src/index.css`.
 *
 * That rule makes every 1-2px utility border transparent (`!important`) so
 * hairline chrome cannot come back. It matches on WIDTH, so without an
 * exemption it also erased `border-track-ring` — the ink ring every
 * track-coloured mark carries so WCAG 1.4.11 is met fill-vs-ring. Blue, green
 * and yellow are all under 3:1 against paper; the ring is the only thing that
 * makes those marks pass. Measured before the exemption: the contribute "+"
 * button on every page and the line swatches on tag figures all rendered with
 * a transparent ring.
 *
 * jsdom does not apply this stylesheet, so a component test cannot see the
 * regression. This reads the rule itself.
 */
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

function borderlessRule(): string {
  const start = css.indexOf("[class~='border-l-2']");
  expect(start, 'borderless-surface rule not found').toBeGreaterThan(-1);
  const end = css.indexOf('border-color: transparent !important;', start);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('borderless-surface rule', () => {
  it('exempts border-track-ring', () => {
    expect(borderlessRule()).toContain("[class~='border-track-ring']");
  });

  it('exempts the checked-state track ring (Checkbox)', () => {
    expect(borderlessRule()).toContain(
      "[data-state='checked'][class~='data-[state=checked]:border-track-ring']",
    );
  });

  // Form-control boundaries: WCAG 1.4.11, gated at 3:1 by tokenContrast.
  it('exempts border-input', () => {
    expect(borderlessRule()).toContain("[class~='border-input']");
  });

  it('keeps the transit-marker opt-out', () => {
    expect(borderlessRule()).toContain('.transit-marker');
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskMark } from '@/components/health/RiskMark';
import {
  TRANSMISSION_RISK_ORDER,
  transmissionRiskVisual,
  RISK_MARK_BORDER,
} from '@/lib/stiRisk';

/**
 * The invariant `stiRisk.ts` has always stated and nothing has ever checked.
 *
 * `stiRisk.test.ts` proves the NEED for the border — its 1.4.11 case asserts
 * that each tint measures under 3:1 against paper, i.e. that the fill alone is
 * not a distinguishable boundary — and then stops, because a constants module
 * cannot know what a component renders. Both consumers accordingly shipped
 * fills with `border-width: 0`, for as long as the surfaces existed, while
 * three separate comments said a border was drawn.
 *
 * So this suite reads the produced DOM. It is the layer where the claim is
 * either true or false.
 */

/**
 * Round-trip an HSL triple through the SAME CSS engine the assertion reads
 * from. jsdom normalises `hsl()` to `rgb()` on write, and its rounding is not
 * the browser's — `0 93% 94%` comes back `rgb(254, 226, 226)` here and
 * `rgb(254, 225, 225)` in Chrome. Comparing to a hand-written rgb string would
 * therefore encode one engine's rounding as the contract and break on the
 * other; comparing to the raw `hsl(...)` string fails everywhere.
 */
function asRendered(hslTriple: string): string {
  const probe = document.createElement('span');
  probe.style.color = `hsl(${hslTriple})`;
  return probe.style.color;
}

describe('RiskMark', () => {
  it('draws a border on every risk level — never a bare fill', () => {
    for (const risk of TRANSMISSION_RISK_ORDER) {
      const { container, unmount } = render(<RiskMark risk={risk} srLabel="x" />);
      const mark = container.firstElementChild as HTMLElement;
      expect(mark.style.borderColor, `${risk} borderColor`).toBe(asRendered(RISK_MARK_BORDER));
      expect(mark.className, `${risk} border width class`).toMatch(/\bborder-2\b/);
      unmount();
    }
  });

  it('borders the fill with an ink LITERAL, not a theme token', () => {
    // `border-foreground` is the trap: ink in light mode, paper in dark, so in
    // dark mode a near-white border would sit on a near-white tint and the
    // separation would vanish in the mode it is hardest to notice. The tints
    // are mode-independent literals; the border has to be one too.
    const { container } = render(<RiskMark risk="high" srLabel="x" />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark.className).not.toMatch(/border-(foreground|border|input|primary)\b/);
    expect(mark.style.borderColor).not.toBe('');
  });

  it('applies each level’s own tint and ink', () => {
    for (const risk of TRANSMISSION_RISK_ORDER) {
      const v = transmissionRiskVisual(risk);
      const { container, unmount } = render(<RiskMark risk={risk} srLabel="x" />);
      const mark = container.firstElementChild as HTMLElement;
      expect(mark.style.backgroundColor).toBe(asRendered(v.tint));
      expect(mark.style.color).toBe(asRendered(v.ink));
      unmount();
    }
  });

  it('never relies on colour alone — an icon is always present', () => {
    const { container } = render(<RiskMark risk="low" srLabel="Low risk" />);
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });

  it('adds the blood glyph as a SECOND mark, not as a different colour', () => {
    const plain = render(<RiskMark risk="high" srLabel="x" />);
    const plainIcons = plain.container.querySelectorAll('svg').length;
    const plainBg = (plain.container.firstElementChild as HTMLElement).style.backgroundColor;
    plain.unmount();

    const { container } = render(<RiskMark risk="high" blood srLabel="x" />);
    expect(container.querySelectorAll('svg').length).toBe(plainIcons + 1);
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe(plainBg);
  });

  it('is never an unnamed icon — the level reaches the accessible tree', () => {
    render(<RiskMark risk="medium" srLabel="Gonorrhea, Fisting: Medium risk" />);
    expect(screen.getByText('Gonorrhea, Fisting: Medium risk')).toBeInTheDocument();

    const { container } = render(<RiskMark risk="medium" label />);
    expect(container.textContent).toContain(transmissionRiskVisual('medium').label);
  });

  it('degrades an unknown risk toward caution, with a border', () => {
    const { container } = render(<RiskMark risk="not-a-level" srLabel="x" />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark.style.backgroundColor).toBe(asRendered(transmissionRiskVisual('high').tint));
    expect(mark.style.borderColor).toBe(asRendered(RISK_MARK_BORDER));
  });

  it('takes the badge radius rank — never element/container/full, never square', () => {
    // 12px (`rounded-element`) pinched adjacent cells into four-point stars;
    // 0px violates the system's "Nothing square". `rounded-badge` is the
    // documented rank for a swatch and is what the mark must carry.
    const cls = (render(<RiskMark risk="high" srLabel="x" />).container
      .firstElementChild as HTMLElement).className;
    expect(cls).toMatch(/\brounded-badge\b/);
    expect(cls).not.toMatch(/rounded-(element|container|full)\b/);
  });
});

/**
 * @vitest-environment jsdom
 *
 * The a11y contract every figure shares, enforced mechanically rather than by
 * review.
 *
 * The rule is: **nothing inside an `<svg>` is ever focusable.** The drawing is
 * `aria-hidden` decoration and every control is an HTML element laid over it.
 * That is what lets this codebase skip a roving-tabindex-inside-SVG pattern
 * entirely — it has none, and after this it never needs one. A reviewer can
 * miss an `<a>` moved into a `<g>`; a DOM query cannot.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import i18n from '@/i18n';
import { fireEvent } from '@testing-library/react';
import ConsentFlow from '../../figures/consentFlow/ConsentFlow';
import { LineStrip } from '../LineStrip';
import { STATIONS } from '../../figures/consentFlow/data';
import { LINES } from '../../figures/fourLines/data';

const baseProps = {
  terms: {},
  currentSlug: undefined,
  reducedMotion: true,
  rtl: false,
  domId: 'test',
};

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex], [contenteditable]';

function renderFlow() {
  return render(<ConsentFlow {...baseProps} />);
}

function renderLines() {
  return render(
    <LineStrip
      {...baseProps}
      lines={LINES}
      readoutTitleKey="tags.figures.fourLines.readout"
      readoutTitleFallback="Your four lines"
      readoutNoteKey="tags.figures.fourLines.independent"
      readoutNoteFallback="Four separate answers."
      renderTermChip={(slug) => <span data-testid="chip">{slug}</span>}
    />,
  );
}

describe('no interactive SVG', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('the consent loop puts no focusable element inside the drawing', () => {
    const { container } = renderFlow();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    }
  });

  it('LineStrip puts no focusable element inside its track drawings', () => {
    const { container } = renderLines();
    const svgs = container.querySelectorAll('svg');
    // A wave per gap, in two layouts. Asserting some
    // exist keeps the next check from passing over an empty set.
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    }
  });

  it('marks every drawing aria-hidden, so the wrapper owns the semantics', () => {
    for (const { container } of [renderFlow(), renderLines()]) {
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });

  it('rides the consent loop with controls outside the SVG', () => {
    const { container, getByRole } = renderFlow();
    fireEvent.click(getByRole('button', { name: 'Start' }));
    for (const b of container.querySelectorAll('button')) expect(b.closest('svg')).toBeNull();
    // Yes all the way round comes back to the first station: no last stop.
    for (const s of STATIONS) fireEvent.click(getByRole('button', { name: s.yesFallback }));
    expect(container.textContent).toContain(STATIONS[0].askFallback);
    expect(container.textContent).toContain('Round 2');
    // Anything else, from any station, goes to Stop.
    fireEvent.click(getByRole('button', { name: STATIONS[0].noFallback }));
    expect(container.textContent).toContain(STATIONS[0].whyFallback);
    expect(getByRole('button', { name: 'Start again' })).toBeTruthy();
  });

  it('gives LineStrip a native input per stop, grouped per line', () => {
    const { container } = renderLines();
    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    const stopCount = LINES.reduce((n, l) => n + l.stops.length, 0);
    expect(inputs).toHaveLength(stopCount);
    // One group per line, so arrow keys move within a line and never across.
    expect(new Set([...inputs].map((r) => r.name)).size).toBe(LINES.length);
    // Pick-one lines are radios; pick-any lines are checkboxes.
    for (const line of LINES) {
      const group = [...inputs].filter((i) => i.name.endsWith(`-${line.id}`));
      for (const i of group) expect(i.type).toBe(line.select === 'one' ? 'radio' : 'checkbox');
    }
  });

  it('labels every stop on the line itself, in the same order as the data', () => {
    const { container } = renderLines();
    for (const line of LINES) {
      const ol = container.querySelector(`ol[data-line="${line.id}"]`);
      expect(ol).not.toBeNull();
      const labels = [...ol!.querySelectorAll('label')].map((l) => l.textContent);
      expect(labels).toEqual(line.stops.map((s) => s.labelFallback));
    }
  });
});

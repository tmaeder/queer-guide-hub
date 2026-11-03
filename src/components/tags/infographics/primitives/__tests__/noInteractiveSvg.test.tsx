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
import { BranchLine } from '../BranchLine';
import { LineStrip } from '../LineStrip';
import { LOOP, STATIONS, STOPS } from '../../figures/consentFlow/data';
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
  return render(
    <BranchLine
      {...baseProps}
      stations={STATIONS}
      loop={LOOP}
      track="pink"
      groupLabel="Stops on the line"
      hintLabel="Select any stop"
      routeLabel="Route"
      restrictionLabel="Speed restriction"
    />,
  );
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

  it('BranchLine puts no focusable element inside the drawing', () => {
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

  it('still exposes a control per stop, outside the SVG', () => {
    const { container } = renderFlow();
    const buttons = container.querySelectorAll('ol button');
    expect(buttons).toHaveLength(STOPS.length);
    for (const b of buttons) expect(b.closest('svg')).toBeNull();
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

describe('focus order follows the line', () => {
  it('lists BranchLine stops in reading order: each station, then its off-ramp', () => {
    const { container } = renderFlow();
    const ids = [...container.querySelectorAll('ol button')].map((b) => b.id.split('-stop-')[1]);
    expect(ids).toEqual(STOPS.map((s) => s.id));
  });
});

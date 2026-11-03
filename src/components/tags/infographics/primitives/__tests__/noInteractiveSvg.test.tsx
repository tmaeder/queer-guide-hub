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
import { FlowGraph } from '../FlowGraph';
import { LineStrip } from '../LineStrip';
import { NODES, EDGES, VIEW, PAD } from '../../figures/consentFlow/data';
import { LINES } from '../../figures/fourLines/data';

const baseProps = {
  terms: {},
  currentSlug: undefined,
  reducedMotion: true,
  rtl: false,
  domId: 'test',
};

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex], [contenteditable]';

function renderFlow(rtl = false) {
  return render(
    <FlowGraph
      {...baseProps}
      rtl={rtl}
      nodes={NODES}
      edges={EDGES}
      viewBox={VIEW}
      padX={PAD.x}
      padY={PAD.y}
      alignColumns
      track="pink"
      groupLabel="Stops on the line"
      hintLabel="Select any stop"
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

  it('FlowGraph puts no focusable element inside the drawing', () => {
    const { container } = renderFlow();
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    }
  });

  it('LineStrip draws no SVG at all, so nothing focusable can hide in one', () => {
    const { container } = renderLines();
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('marks every drawing aria-hidden, so the wrapper owns the semantics', () => {
    for (const { container } of [renderFlow()]) {
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });

  it('still exposes a control per stop, outside the SVG', () => {
    const { container } = renderFlow();
    const buttons = container.querySelectorAll('ol button');
    expect(buttons).toHaveLength(NODES.length);
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

describe('focus order follows the flow', () => {
  it('lists FlowGraph stops in lane-then-slot order', () => {
    const { container } = renderFlow();
    const ids = [...container.querySelectorAll('ol button')].map((b) => b.id.split('-node-')[1]);
    const byId = new Map(NODES.map((n) => [n.id, n]));
    for (let i = 1; i < ids.length; i += 1) {
      const prev = byId.get(ids[i - 1])!;
      const cur = byId.get(ids[i])!;
      expect(prev.lane < cur.lane || (prev.lane === cur.lane && prev.slot < cur.slot)).toBe(true);
    }
  });
});

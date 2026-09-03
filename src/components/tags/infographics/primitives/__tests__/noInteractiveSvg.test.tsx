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
import { AxisSet } from '../AxisSet';
import { NODES, EDGES, VIEW, PAD } from '../../figures/consentFlow/data';
import { AXES, JUNCTION, VIEW as FOUR_VIEW } from '../../figures/fourLines/data';

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

function renderAxes(rtl = false) {
  return render(
    <AxisSet
      {...baseProps}
      rtl={rtl}
      axes={AXES}
      viewBox={FOUR_VIEW}
      junction={JUNCTION}
      readoutTitleKey="tags.figures.fourLines.readout"
      readoutTitleFallback="Where you are"
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

  it('AxisSet puts no focusable element inside the drawing', () => {
    const { container } = renderAxes();
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    }
  });

  it('marks every drawing aria-hidden, so the wrapper owns the semantics', () => {
    for (const { container } of [renderFlow(), renderAxes()]) {
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

  it('gives AxisSet a native radio per station, so arrow keys work for free', () => {
    const { container } = renderAxes();
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const stationCount = AXES.reduce((n, a) => n + a.stations.length, 0);
    expect(radios).toHaveLength(stationCount);
    // One group per line, so arrow keys move within a line and never across.
    expect(new Set([...radios].map((r) => r.name)).size).toBe(AXES.length);
    for (const r of radios) expect(r.closest('svg')).toBeNull();
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

describe('RTL mirrors the geometry, not the element', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('AxisSet mirrors every station and never scales the wrapper', () => {
    const lefts = (c: HTMLElement) =>
      [...c.querySelectorAll<HTMLElement>('span[aria-hidden="true"][style*="left"]')].map((s) =>
        Number.parseFloat(s.style.left),
      );

    const ltr = renderAxes(false);
    const ltrLefts = lefts(ltr.container);
    expect(ltr.container.querySelector('svg g')?.getAttribute('transform')).toBeNull();
    ltr.unmount();

    const rtl = renderAxes(true);
    const rtlLefts = lefts(rtl.container);
    expect(rtl.container.querySelector('svg g')?.getAttribute('transform')).toBe(
      `translate(${FOUR_VIEW.w},0) scale(-1,1)`,
    );
    // An `rtl:-scale-x-100` on the wrapper would flip each ring's own centring
    // translate a SECOND time and drop every station off its line.
    expect(rtl.container.innerHTML).not.toContain('scale-x');

    expect(rtlLefts).toHaveLength(ltrLefts.length);
    rtlLefts.forEach((v, i) => expect(v).toBeCloseTo(100 - ltrLefts[i], 5));
    rtl.unmount();
  });
});

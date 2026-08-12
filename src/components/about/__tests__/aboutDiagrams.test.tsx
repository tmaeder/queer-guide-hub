/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import i18n from '@/i18n';
import { NetworkDiagram } from '../NetworkDiagram';
import { HistoryLine } from '../HistoryLine';

const STOPS = [
  { year: '2021', body: 'a' },
  { year: '2023', body: 'b' },
  { year: '2025', body: 'c' },
  { year: '2026', body: 'd' },
];

/** Station centres, in document order, as percentages of the band. */
const ringLefts = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>('span[aria-hidden="true"][style*="left"]')).map((s) =>
    Number.parseFloat(s.style.left),
  );

const groupTransform = (c: HTMLElement) => c.querySelector('svg g')?.getAttribute('transform');

describe('about diagrams — RTL mirrors the geometry, not the element', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('NetworkDiagram mirrors every station and the path together', async () => {
    const ltr = render(<NetworkDiagram label="x" />);
    const ltrLefts = ringLefts(ltr.container);
    expect(groupTransform(ltr.container)).toBeNull();
    ltr.unmount();

    await i18n.changeLanguage('ar');
    const rtl = render(<NetworkDiagram label="x" />);
    const rtlLefts = ringLefts(rtl.container);

    // The path mirrors inside the SVG — never via a CSS scale on the wrapper,
    // which would flip each ring's own centring translate a second time.
    expect(groupTransform(rtl.container)).toBe('translate(300,0) scale(-1,1)');
    expect(rtl.container.querySelector('[role="img"]')?.className).not.toContain('scale-x');

    // Every station is the exact complement of its LTR position, so it stays
    // on the line rather than drifting off it.
    expect(rtlLefts).toHaveLength(ltrLefts.length);
    rtlLefts.forEach((v, i) => expect(v).toBeCloseTo(100 - ltrLefts[i], 5));
    rtl.unmount();
  });

  it('HistoryLine puts each station under its own year in both directions', async () => {
    const ltr = render(<HistoryLine stops={STOPS} />);
    const ltrLefts = ringLefts(ltr.container);
    // 4-column grid centres.
    expect(ltrLefts).toEqual([12.5, 37.5, 62.5, 87.5]);
    ltr.unmount();

    await i18n.changeLanguage('ar');
    const rtl = render(<HistoryLine stops={STOPS} />);
    // The grid reverses itself under `dir`, so stop 0 ("2021") is already the
    // rightmost column. Mirroring the x is the whole correction: re-indexing
    // the stations on top of it would send 2021 back to 12.5% and put every
    // year over the wrong station.
    expect(ringLefts(rtl.container)).toEqual([87.5, 62.5, 37.5, 12.5]);
    rtl.unmount();
  });
});

import { describe, it, expect } from 'vitest';
import {
  groupPractices,
  orderedPractices,
  routesFor,
  weekOffsetPercent,
  barStartPercent,
  MAX_BAR_START_PERCENT,
  PRACTICE_GROUP_ORDER,
  SCALE_WEEKS,
  WEEK_TICKS,
  type Practice,
  type Cell,
  type Sti,
} from '@/lib/stiGuideModel';

/**
 * The practice list EXACTLY as `sti_transmission_matrix()` returns it on prod
 * (read 2026-09-04). It is deliberately not sorted here: the unsorted tail —
 * `mutual-masturbation` (oral_touching) after `cunnilingus` (vaginal), then
 * `scat` (anorectal) last — is the input that made the old run-length grouping
 * print six column bands instead of four. A tidied fixture would pass against
 * the broken implementation and prove nothing.
 */
const LIVE_PRACTICES: Practice[] = [
  { slug: 'anal-penetration', group: 'anorectal', label: 'Anal penetration' },
  { slug: 'fisting', group: 'anorectal', label: 'Fisting' },
  { slug: 'rimming', group: 'anorectal', label: 'Rimming' },
  { slug: 'toy-sharing', group: 'anorectal', label: 'Sharing sex toys' },
  { slug: 'fellatio', group: 'oral_touching', label: 'Fellatio' },
  { slug: 'kissing', group: 'oral_touching', label: 'Kissing' },
  { slug: 'sexual-caress', group: 'oral_touching', label: 'Skin-to-skin contact' },
  { slug: 'syringe-sharing', group: 'chems', label: 'Sharing syringes (slamming)' },
  { slug: 'straw-sharing', group: 'chems', label: 'Sharing sniffing straws' },
  { slug: 'vaginal-penetration', group: 'vaginal', label: 'Vaginal penetration' },
  { slug: 'cunnilingus', group: 'vaginal', label: 'Cunnilingus' },
  { slug: 'mutual-masturbation', group: 'oral_touching', label: 'Mutual masturbation' },
  { slug: 'scat', group: 'anorectal', label: 'Faecal contact (scat)' },
];

describe('groupPractices', () => {
  it('emits one band per group, never one per run of adjacent rows', () => {
    const groups = groupPractices(LIVE_PRACTICES);
    const keys = groups.map((g) => g.group);
    // The bug this replaces produced six, with anorectal and oral_touching
    // printed twice at opposite ends of the chart.
    expect(keys).toEqual(['anorectal', 'oral_touching', 'chems', 'vaginal']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('collects the out-of-order tail into the band it belongs to', () => {
    const groups = groupPractices(LIVE_PRACTICES);
    const byKey = Object.fromEntries(groups.map((g) => [g.group, g.practices.map((p) => p.slug)]));
    expect(byKey.anorectal).toContain('scat');
    expect(byKey.oral_touching).toContain('mutual-masturbation');
    expect(byKey.anorectal).toHaveLength(5);
    expect(byKey.oral_touching).toHaveLength(4);
  });

  it('loses no practice and duplicates none', () => {
    const flat = orderedPractices(groupPractices(LIVE_PRACTICES));
    expect(flat).toHaveLength(LIVE_PRACTICES.length);
    expect(new Set(flat.map((p) => p.slug)).size).toBe(LIVE_PRACTICES.length);
  });

  it('orders bands by the declared vocabulary, not by arrival', () => {
    const shuffled = [...LIVE_PRACTICES].reverse();
    expect(groupPractices(shuffled).map((g) => g.group)).toEqual([...PRACTICE_GROUP_ORDER]);
  });

  it('keeps an unknown group rather than dropping it, and sorts it last', () => {
    // On a safety chart a practice the bundle has no label for must still be
    // rendered under its raw key. Silently dropping it removes a documented
    // route from the page and nothing anywhere would say so.
    const withNew: Practice[] = [
      { slug: 'novel', group: 'not_yet_labelled', label: 'Novel practice' },
      ...LIVE_PRACTICES,
    ];
    const keys = groupPractices(withNew).map((g) => g.group);
    expect(keys).toHaveLength(5);
    expect(keys[keys.length - 1]).toBe('not_yet_labelled');
    expect(orderedPractices(groupPractices(withNew)).map((p) => p.slug)).toContain('novel');
  });

  it('is empty for an empty input rather than throwing', () => {
    expect(groupPractices([])).toEqual([]);
  });
});

describe('routesFor', () => {
  const sti: Sti = { id: 'a', slug: 'hiv', name: 'HIV', pathogen: 'virus' };
  const other: Sti = { id: 'b', slug: 'mpox', name: 'Mpox', pathogen: 'virus' };
  const cells: Cell[] = [
    { tag: 'a', practice: 'kissing', risk: 'low', severity: 3, blood: false },
    { tag: 'a', practice: 'anal-penetration', risk: 'high', severity: 1, blood: false },
    { tag: 'a', practice: 'fisting', risk: 'medium', severity: 2, blood: true },
    { tag: 'b', practice: 'rimming', risk: 'high', severity: 1, blood: false },
  ];

  it('returns only this infection’s routes', () => {
    expect(routesFor(sti, LIVE_PRACTICES, cells).map((r) => r.practice.slug)).not.toContain(
      'rimming',
    );
    expect(routesFor(other, LIVE_PRACTICES, cells)).toHaveLength(1);
  });

  it('orders worst first — the whole point of the narrow layout', () => {
    const order = routesFor(sti, LIVE_PRACTICES, cells).map((r) => r.risk);
    expect(order).toEqual(['high', 'medium', 'low']);
  });

  it('breaks ties on the grouped column order so both layouts agree', () => {
    const tied: Cell[] = [
      { tag: 'a', practice: 'scat', risk: 'high', severity: 1, blood: false },
      { tag: 'a', practice: 'anal-penetration', risk: 'high', severity: 1, blood: false },
    ];
    const grouped = orderedPractices(groupPractices(LIVE_PRACTICES));
    expect(routesFor(sti, grouped, tied).map((r) => r.practice.slug)).toEqual([
      'anal-penetration',
      'scat',
    ]);
  });

  it('carries the blood modifier through', () => {
    const fisting = routesFor(sti, LIVE_PRACTICES, cells).find(
      (r) => r.practice.slug === 'fisting',
    );
    expect(fisting?.blood).toBe(true);
  });

  it('drops a cell naming a practice the matrix does not list', () => {
    const stray: Cell[] = [{ tag: 'a', practice: 'gone', risk: 'high', severity: 1, blood: false }];
    expect(routesFor(sti, LIVE_PRACTICES, stray)).toEqual([]);
  });
});

describe('testing-window scale', () => {
  it('places every tick inside the track', () => {
    for (const w of WEEK_TICKS) {
      const pct = weekOffsetPercent(w);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
    expect(weekOffsetPercent(0)).toBe(0);
    expect(weekOffsetPercent(SCALE_WEEKS)).toBe(100);
  });

  it('is linear, so two bars are comparable by length', () => {
    expect(weekOffsetPercent(4)).toBe(25);
    expect(weekOffsetPercent(8)).toBe(50);
    expect(weekOffsetPercent(12)).toBe(75);
  });

  it('clamps rather than overflowing if the data outgrows the scale', () => {
    expect(weekOffsetPercent(52)).toBe(100);
    expect(weekOffsetPercent(-4)).toBe(0);
  });
});

describe('barStartPercent', () => {
  /**
   * The bar is `left: x%; right: 0`, so its width is `100 - x`. A bar that
   * starts at 100% has ZERO width and renders as nothing — the longest, most
   * consequential window would be the one that silently disappears.
   *
   * This suite replaces one that claimed to guard the same property and could
   * not: it iterated the hardcoded literal `[2,4,6,8,12]` while its comment
   * said "if a longer one lands, this fails". A list written in the test file
   * cannot notice a row landing in the database. So assert the INVARIANT —
   * every input keeps the bar visible — over any week value at all, which is
   * true regardless of what the corpus does next.
   */
  it('never lets a bar reach zero width, at any week value', () => {
    for (const weeks of [0, 1, 2, 4, 6, 8, 12, 15, 16, 20, 52, 1000]) {
      expect(barStartPercent(weeks), `${weeks}w`).toBeLessThanOrEqual(MAX_BAR_START_PERCENT);
      expect(100 - barStartPercent(weeks), `${weeks}w width`).toBeGreaterThan(0);
    }
  });

  it('is the identity below the cap, so real windows are still to scale', () => {
    for (const weeks of [0, 2, 4, 6, 8, 12]) {
      expect(barStartPercent(weeks)).toBe(weekOffsetPercent(weeks));
    }
  });

  it('caps exactly where the scale ends — the case the old guard never saw', () => {
    // 16w is `weekOffsetPercent` 100, i.e. a 0px bar. This is the one that was
    // regressed when the rewrite dropped the pre-existing 90% clamp.
    expect(weekOffsetPercent(SCALE_WEEKS)).toBe(100);
    expect(barStartPercent(SCALE_WEEKS)).toBe(MAX_BAR_START_PERCENT);
  });

  it('places ticks and bars on one shared scale', () => {
    // The axis labels, the tick rules and the bar all derive from these two
    // functions. If they ever disagreed, the number over a line would stop
    // naming the line.
    for (const w of WEEK_TICKS) {
      if (weekOffsetPercent(w) <= MAX_BAR_START_PERCENT) {
        expect(barStartPercent(w)).toBe(weekOffsetPercent(w));
      }
    }
  });
});

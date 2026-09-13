import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  publishableCitySlug,
  cityLinkItem,
  formatHoursForCrawler,
} from '../../../functions/_lib/detail';

/**
 * Venue/event/hotel crawler bodies linked `/places/${slugify(city_text)}`, and
 * `slugify` was `toLowerCase().replace(/[^a-z0-9]+/g,'-')` — no
 * transliteration, no trim. Measured on prod 2026-09-10:
 *
 *   venues  9,293 of 23,077 (40.3%) linked to a slug no city row has
 *   events    517 of  2,972 (17.4%)
 *   hotels     80 of    323 (24.8%)
 *
 * "Zürich" became `z-rich` (404) and "Wilmington (Long Beach)" became
 * `wilmington-long-beach-` (404). Both verified live.
 *
 * WORSE THAN THE 404s: a further 636 venues linked to a city that EXISTS BUT IS
 * THE WRONG PLACE — every venue in Victoria, BC pointed at Victoria,
 * SEYCHELLES, and Grad Hvar (Croatia) at a French commune. A wrong-but-live
 * link looks correct to every automated check and to the reader until they
 * arrive. Same-name-city collisions are documented at length in CLAUDE.md;
 * this was that class reached through a link rather than a resolver.
 *
 * The slug now comes from the row's FK. Where there is no usable city, NO link
 * is emitted: a missing link costs a crawl path, a wrong one sends a reader to
 * another country.
 */

const city = (over: Record<string, unknown> = {}) => ({
  cities: {
    slug: 'victoria-bc',
    seo_indexable: true,
    duplicate_of_id: null,
    shell_status: 'real',
    ...over,
  },
});

describe('publishableCitySlug', () => {
  it('returns the FK slug, never one derived from the name', () => {
    expect(publishableCitySlug(city())).toBe('victoria-bc');
  });

  it('refuses a city that is not publishable', () => {
    // Each of these alone must be disqualifying — a hub/detail link must not
    // advertise a row the sitemaps themselves exclude.
    expect(publishableCitySlug(city({ seo_indexable: false }))).toBeNull();
    expect(publishableCitySlug(city({ duplicate_of_id: 'x' }))).toBeNull();
    expect(publishableCitySlug(city({ shell_status: 'ghost' }))).toBeNull();
    expect(publishableCitySlug(city({ shell_status: 'merged' }))).toBeNull();
  });

  it('refuses a missing, empty or absent city', () => {
    expect(publishableCitySlug({})).toBeNull();
    expect(publishableCitySlug({ cities: null })).toBeNull();
    expect(publishableCitySlug(city({ slug: '' }))).toBeNull();
    expect(publishableCitySlug(city({ slug: undefined }))).toBeNull();
  });
});

describe('cityLinkItem', () => {
  it('links /city/<fk slug> and shows the display name', () => {
    const html = cityLinkItem(city(), 'Victoria');
    expect(html).toContain('href="/city/victoria-bc"');
    expect(html).toContain('More in Victoria');
    // The old form pointed at /places/, which 301s — a needless hop for a crawler.
    expect(html).not.toContain('/places/');
  });

  it('emits NOTHING rather than a dead or wrong link', () => {
    expect(cityLinkItem({}, 'Anywhere')).toBe('');
    expect(cityLinkItem(city({ shell_status: 'ghost' }), 'Anywhere')).toBe('');
  });

  it('escapes the display name and falls back to the slug', () => {
    expect(cityLinkItem(city(), 'A & "B"')).toContain('A &amp; &quot;B&quot;');
    expect(cityLinkItem(city(), null)).toContain('More in victoria-bc');
    expect(cityLinkItem(city(), undefined)).toContain('More in victoria-bc');
  });
});

describe('formatHoursForCrawler', () => {
  // The real shape, identical across all 609 venues that carry hours.
  const real = {
    display: 'Mon-Thu 11:00-23:00; Fri-Sat 11:00-24:00; Sun 11:00-23:00',
    open_now: false,
    regular: [{ day: 1, open: '1100', close: '2300' }],
    popular: [{ day: 1, open: '1200', close: '2300' }],
  };

  it('reads display and terminates the sentence', () => {
    expect(formatHoursForCrawler(real)).toBe(
      'Mon-Thu 11:00-23:00; Fri-Sat 11:00-24:00; Sun 11:00-23:00.',
    );
  });

  it('never leaks open_now — it is frozen at scrape time', () => {
    const out = formatHoursForCrawler(real) ?? '';
    expect(out.toLowerCase()).not.toContain('open');
    expect(out).not.toContain('false');
  });

  it('never renders regular/popular, whose close time is "+0000"', () => {
    const out = formatHoursForCrawler({ ...real, display: 'Mon 11:00-23:00' }) ?? '';
    expect(out).not.toContain('+0000');
    expect(out).not.toContain('1100');
  });

  it('returns null for shapes it cannot read, rather than guessing', () => {
    // The FIRST version of this function walked monday..sunday keys. ZERO rows
    // have such a key, so it rendered nothing on every page while looking like
    // it worked. This asserts the day-key shape is genuinely unsupported, so
    // that mistake cannot be reintroduced as a silent no-op.
    expect(formatHoursForCrawler({ monday: '18:00-02:00' })).toBeNull();
    expect(formatHoursForCrawler(null)).toBeNull();
    expect(formatHoursForCrawler('Mon 9-5')).toBeNull();
    expect(formatHoursForCrawler([])).toBeNull();
    expect(formatHoursForCrawler({ display: '   ' })).toBeNull();
    expect(formatHoursForCrawler({ display: 'x'.repeat(301) })).toBeNull();
  });
});

describe('the name-derived slug helper is gone', () => {
  it('no city link is built from a display name anywhere in detail.ts', () => {
    const src = readFileSync(join(process.cwd(), 'functions/_lib/detail.ts'), 'utf8');
    const code = src
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
      })
      .join('\n');
    expect(code).not.toContain('slugify(city)');
    // …and the helper itself is deleted, so it cannot be reached for again.
    expect(code).not.toMatch(/const slugify\s*=/);
    // Positive control: the stripper left the real code intact.
    expect(code).toContain('publishableCitySlug');
  });
});

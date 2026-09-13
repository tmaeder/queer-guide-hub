import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd } from '../../../functions/_lib/jsonLd';

/**
 * Measured on production 2026-09-10: NO detail page emitted a BreadcrumbList,
 * and no hub page emitted any JSON-LD at all. Google renders breadcrumbs in the
 * result snippet in place of the raw URL, so this is the cheapest structured
 * data available here — the trail is already implied by the path.
 *
 * Two rules the shape has to keep:
 *  - A recognised detail path yields a THREE-item trail (Home > hub > page). A
 *    one-item "Home" trail describes nothing and is a rich-result warning, so
 *    unrecognised paths return '' instead.
 *  - The leaf drops the " | Queer Guide" title suffix. That suffix is chrome;
 *    repeating it inside a breadcrumb reads as a second site name.
 */

const parse = (html: string) => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`no JSON-LD in: ${html.slice(0, 80)}`);
  // renderLd escapes < > & for safe inlining; undo before parsing.
  const raw = m[1]
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&');
  return JSON.parse(raw);
};

describe('breadcrumbJsonLd', () => {
  it('builds Home > hub > page for a venue', () => {
    const ld = parse(breadcrumbJsonLd('/venues/bar-1-5', 'Bar 1 — Phoenix | Queer Guide'));
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      'Home',
      'Venues',
      'Bar 1 — Phoenix',
    ]);
    expect(ld.itemListElement[2].item).toBe('https://queer.guide/venues/bar-1-5');
    expect(ld.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
  });

  it('routes city, country and village to the /places hub they share', () => {
    for (const p of ['/city/berlin', '/country/germany', '/villages/soho']) {
      const ld = parse(breadcrumbJsonLd(p, 'X | Queer Guide'));
      expect(ld.itemListElement[1].name).toBe('Places');
      expect(ld.itemListElement[1].item).toBe('https://queer.guide/places');
    }
  });

  it('handles the singular path forms the detail regex accepts', () => {
    // DETAIL_ROUTE_RE matches /venue/x, /tag/x, /personality/x etc. Missing
    // these would silently drop breadcrumbs on exactly those URLs.
    for (const [p, hub] of [
      ['/venue/x', 'Venues'],
      ['/tag/x', 'Glossary'],
      ['/personality/x', 'People'],
      ['/hotel/x', 'Hotels'],
      ['/event/x', 'Events'],
    ] as const) {
      expect(parse(breadcrumbJsonLd(p, 'X | Queer Guide')).itemListElement[1].name).toBe(hub);
    }
  });

  it('strips the site suffix from the leaf, and only the suffix', () => {
    const ld = parse(breadcrumbJsonLd('/tags/eunuch', 'Eunuch | Queer Guide'));
    expect(ld.itemListElement[2].name).toBe('Eunuch');
    // A title without the suffix is used as-is.
    const ld2 = parse(breadcrumbJsonLd('/tags/eunuch', 'Eunuch'));
    expect(ld2.itemListElement[2].name).toBe('Eunuch');
    // "Queer Guide" occurring mid-title is not a suffix and must survive.
    const ld3 = parse(breadcrumbJsonLd('/news/x', 'Queer Guide wins award | Queer Guide'));
    expect(ld3.itemListElement[2].name).toBe('Queer Guide wins award');
  });

  it('returns nothing for paths it does not recognise', () => {
    // A single "Home" crumb describes nothing; '' is the correct answer.
    expect(breadcrumbJsonLd('/', 'Home | Queer Guide')).toBe('');
    expect(breadcrumbJsonLd('/venues', 'Venues | Queer Guide')).toBe('');
    expect(breadcrumbJsonLd('/about', 'About | Queer Guide')).toBe('');
    expect(breadcrumbJsonLd('/marketplace/x', 'X | Queer Guide')).toBe('');
    expect(breadcrumbJsonLd('', 'X')).toBe('');
  });

  it('returns nothing when the title is only the suffix', () => {
    expect(breadcrumbJsonLd('/venues/x', ' | Queer Guide')).toBe('');
  });
});

describe('a truncated title suffix', () => {
  const leafOf = (title: string) => {
    const html = breadcrumbJsonLd('/hotels/x', title);
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    const raw = m![1]
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\\u0026/g, '&');
    return JSON.parse(raw).itemListElement[2].name;
  };

  it('strips a dangling pipe left by title truncation', () => {
    // Real case: detail.ts truncates to MAX_TITLE=60, which cut into the
    // " | Queer Guide" suffix and left "|…" in the breadcrumb leaf.
    expect(leafOf("Billy's Resort -Men only- Voyr Bungalow — Wilton Manors |…")).toBe(
      "Billy's Resort -Men only- Voyr Bungalow — Wilton Manors",
    );
    expect(leafOf('Some Venue |')).toBe('Some Venue');
    expect(leafOf('Some Venue |...')).toBe('Some Venue');
  });

  it('leaves a pipe that is part of the title alone', () => {
    expect(leafOf('Bar A | Bar B')).toBe('Bar A | Bar B');
  });
});

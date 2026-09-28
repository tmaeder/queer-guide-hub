import { describe, expect, it } from 'vitest';
import {
  parseSitemap,
  parseVenueHtml,
  parseVenueUrl,
  toNormalizedVenue,
} from '../../../scripts/data-quality/lib/gayout-import-core.mjs';

describe('GayOut venue import', () => {
  it('accepts venue URLs and rejects category pages', () => {
    expect(
      parseVenueUrl('https://www.gayout.com/europe/hungary/budapest/bars/funny-carrot-784'),
    ).toMatchObject({
      source_id: '/europe/hungary/budapest/bars/funny-carrot-784',
      section: 'bars',
      category: 'bar',
      name_fallback: 'Funny Carrot',
    });
    expect(parseVenueUrl('https://www.gayout.com/europe/hungary/budapest/bars/')).toBeNull();
    expect(parseVenueUrl('https://example.com/europe/hungary/budapest/bars/foo')).toBeNull();
  });

  it('deduplicates and filters sitemap entries', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.gayout.com/europe/hungary/budapest/bars/funny-carrot-784</loc><lastmod>2026-09-28</lastmod></url>
      <url><loc>https://www.gayout.com/europe/hungary/budapest/bars/funny-carrot-784</loc></url>
      <url><loc>https://www.gayout.com/europe/hungary/budapest/bars/</loc></url>
    </urlset>`;
    expect(parseSitemap(xml)).toHaveLength(1);
    expect(parseSitemap(xml)[0].lastmod).toBe('2026-09-28');
  });

  it('extracts factual JSON-LD fields and ignores editorial descriptions', () => {
    const seed = parseVenueUrl(
      'https://www.gayout.com/europe/hungary/budapest/bars/why-not-cafe-budapest',
    )!;
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BarOrPub',
      name: 'Why Not Café & Bar',
      description: 'Do not copy this editorial text',
      url: seed.url,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Belgrád rakpart 3-4',
        addressLocality: 'Budapest',
        addressCountry: 'HU',
      },
      geo: { '@type': 'GeoCoordinates', latitude: '47.4966', longitude: '19.0506' },
      telephone: '+36 1 555 0100',
      sameAs: ['https://example.com/venue', 'not-a-url'],
    })}</script>`;
    const record = parseVenueHtml(html, seed);
    expect(record).toMatchObject({
      name: 'Why Not Café & Bar',
      address: 'Belgrád rakpart 3-4',
      city: 'Budapest',
      country: 'HU',
      lat: 47.4966,
      lng: 19.0506,
      phone: '+36 1 555 0100',
      same_as: ['https://example.com/venue'],
      detail_status: 'parsed',
    });
    expect(toNormalizedVenue(record)).toMatchObject({ contacts: { phone: '+36 1 555 0100' } });
    expect(toNormalizedVenue(record)).not.toHaveProperty('description');
  });

  it('keeps sitemap-only rows stageable and provenance-rich', () => {
    const seed = parseVenueUrl(
      'https://www.gayout.com/africa/south-africa/cape-town/beaches/sandy-bay-beach-146',
      '2026-09-28',
    )!;
    expect(toNormalizedVenue(seed)).toMatchObject({
      sourceName: 'gayout',
      name: 'Sandy Bay Beach',
      category: 'outdoor',
      location: { city: 'Cape Town' },
      metadata: { detail_status: 'sitemap_only', lastmod: '2026-09-28' },
    });
  });

  it('maps organizations to the production venue category contract', () => {
    const seed = parseVenueUrl(
      'https://www.gayout.com/asia-aus/nepal/kathmandu/organizations/blue-diamond-society-kathmandu',
    )!;
    expect(seed.category).toBe('community_center');
    expect(toNormalizedVenue(seed).category).toBe('community_center');
  });
});

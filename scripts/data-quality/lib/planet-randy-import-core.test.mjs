import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeHtml,
  countryCodeFromAddress,
  countryCodeForPoint,
  listingFromBrowserRow,
  parseDetailPage,
  parseLastPage,
  parseListingPage,
  toNormalizedVenue,
  validateRecord,
} from './planet-randy-import-core.mjs';

const listingHtml = `
<article class="listing-item listing-map-data listing_category-gay-sauna" data-id="14192"
 data-title="Sauna Nieuwezijds" data-address="Nieuwezijds Armsteeg 95"
 data-lat="52.376987" data-lng="4.895653"
 data-image="https://planet-randy.com/a/Sauna-150x150.jpg">
 <h4 class="entry-title"><a href="https://planet-randy.com/blog/en/eintrag/sauna-nieuwezijds/" title="Sauna Nieuwezijds">Sauna</a></h4>
 <li class="listing-address"><div class="listing-address-wrap">95 Nieuwezijds Armsteeg, Amsterdam</div></li>
 <li class="listing-phone"><a href="tel:+31203318327">Call</a></li>
</article>
<a href="https://planet-randy.com/blog/en/eintrag/page/143/?x=1">143</a>`;

test('listing parser extracts stable identity, category, location, and last page', () => {
  assert.equal(parseLastPage(listingHtml), 143);
  assert.deepEqual(parseListingPage(listingHtml), [
    {
      source_id: '14192',
      url: 'https://planet-randy.com/blog/en/eintrag/sauna-nieuwezijds/',
      name: 'Sauna Nieuwezijds',
      category: 'sauna',
      category_slug: 'gay-sauna',
      address_display: '95 Nieuwezijds Armsteeg, Amsterdam',
      lat: 52.376987,
      lng: 4.895653,
      phone: '+31203318327',
      source_image_url: 'https://planet-randy.com/a/Sauna.jpg',
    },
  ]);
});

test('adult cinemas map to cruising', () => {
  const html = listingHtml.replace('listing_category-gay-sauna', 'listing_category-gay-kinos');
  assert.equal(parseListingPage(html)[0].category, 'cruising');
});

test('browser archive rows normalize through the same category contract', () => {
  assert.deepEqual(
    listingFromBrowserRow([
      '14192',
      '/blog/en/eintrag/sauna-nieuwezijds/',
      'Sauna Nieuwezijds',
      'listing-item listing_category-gay-sauna',
      '95 Nieuwezijds Armsteeg, Amsterdam',
      '52.376987',
      '4.895653',
      '+31203318327',
      'https://planet-randy.com/a/Sauna-150x150.jpg',
    ]),
    parseListingPage(listingHtml)[0],
  );
});

test('HTML decoding resolves double-encoded source names', () => {
  assert.equal(decodeHtml('Men&amp;#039;s &amp;amp; Women'), "Men's & Women");
});

test('country lookup handles polygon holes and ISO2 properties', () => {
  const boundaries = {
    features: [
      {
        properties: { ISO_A2_EH: 'DE' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [5, 47],
              [16, 47],
              [16, 55],
              [5, 55],
              [5, 47],
            ],
            [
              [9, 50],
              [10, 50],
              [10, 51],
              [9, 51],
              [9, 50],
            ],
          ],
        },
      },
    ],
  };
  assert.equal(countryCodeForPoint(boundaries, 13.4, 52.5), 'DE');
  assert.equal(countryCodeForPoint(boundaries, 9.5, 50.5), undefined);
});

test('address fallback recognizes explicit country names and German postcodes', () => {
  assert.equal(countryCodeFromAddress('25491 Hetlingen'), 'DE');
  assert.equal(countryCodeFromAddress('Nieuwezijds Armsteeg 95, Netherlands'), 'NL');
  assert.equal(countryCodeFromAddress('Berlin'), undefined);
});

test('detail parser prefers structured address and official website', () => {
  const seed = parseListingPage(listingHtml)[0];
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'LocalBusiness',
    name: 'Sauna Nieuwezijds',
    telephone: '+31 20 331 8327',
    address: {
      streetAddress: '95 Nieuwezijds Armsteeg',
      addressLocality: 'Amsterdam',
      addressRegion: 'NH',
      postalCode: '1012 NB',
      addressCountry: 'NL',
    },
    geo: { latitude: '52.376987', longitude: '4.895653' },
  })}</script><li id="listing-website"><a href="https://saunanieuwezijds.nl/">Visit Website</a></li>`;
  const record = parseDetailPage(html, seed);
  assert.equal(record.country, 'NL');
  assert.equal(record.city, 'Amsterdam');
  assert.equal(record.website, 'https://saunanieuwezijds.nl/');
  assert.deepEqual(validateRecord(record), []);
});

test('validation rejects malformed coordinates and missing country', () => {
  const seed = parseListingPage(listingHtml)[0];
  const record = parseDetailPage('<html></html>', { ...seed, lat: 999, lng: undefined });
  assert.deepEqual(validateRecord(record), ['missing_iso2_country', 'partial_coordinate_pair']);
});

test('normalization keeps source image only in provenance metadata', () => {
  const record = parseDetailPage(
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'LocalBusiness',
      name: 'Example',
      address: { streetAddress: 'Street 1', addressCountry: 'DE' },
      geo: { latitude: 52.5, longitude: 13.4 },
    })}</script>`,
    parseListingPage(listingHtml)[0],
  );
  const normalized = toNormalizedVenue(record);
  assert.equal(normalized.sourceName, 'planet-randy');
  assert.equal(normalized.metadata.source_image_url, 'https://planet-randy.com/a/Sauna.jpg');
  assert.equal('images' in normalized, false);
});

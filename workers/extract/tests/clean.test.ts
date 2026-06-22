import { describe, it, expect } from 'vitest';
import { cleanHtml } from '../src/clean';
import { assertPublicHttpUrl, UnsafeUrlError } from '../src/ssrf';

const ARTICLE_HTML = `
<!doctype html><html lang="en-US"><head>
  <title>Pride Week Returns</title>
  <meta name="description" content="The festival is back.">
  <meta property="og:image" content="/img/pride.jpg">
  <meta property="article:published_time" content="2026-06-01T10:00:00Z">
  <meta name="author" content="Jane Doe">
</head><body>
  <nav><a href="/home">Home</a></nav>
  <article>
    <h1>Pride Week Returns</h1>
    <p>This is the first substantial paragraph of the article body, long enough to clear the density threshold used by the extractor.</p>
    <p>A second paragraph with <a href="https://example.com/tickets">tickets</a> and more detail to push the character count well past two hundred and fifty characters total.</p>
  </article>
  <footer><a href="/privacy">Privacy</a></footer>
  <a href="/events/parade">Parade</a>
  <a href="https://other.org/external">External</a>
</body></html>`;

describe('cleanHtml', () => {
  it('extracts markdown, metadata and method from an article page', () => {
    const r = cleanHtml(ARTICLE_HTML, 'https://news.example.com/pride');
    expect(r.markdown).toContain('Pride Week Returns');
    expect(r.markdown).toContain('first substantial paragraph');
    expect(r.markdown).toContain('[tickets](https://example.com/tickets)');
    expect(r.contentMethod).toBe('article');
    expect(r.charCount).toBeGreaterThan(250);
    expect(r.meta.title).toBe('Pride Week Returns');
    expect(r.meta.description).toBe('The festival is back.');
    expect(r.meta.lang).toBe('en');
    expect(r.meta.author).toBe('Jane Doe');
    expect(r.meta.publishedAt).toBe('2026-06-01T10:00:00.000Z');
    expect(r.meta.image).toBe('https://news.example.com/img/pride.jpg');
  });

  it('returns no links unless crawl is requested', () => {
    const r = cleanHtml(ARTICLE_HTML, 'https://news.example.com/pride');
    expect(r.links.flat).toHaveLength(0);
  });

  it('categorizes same-origin vs external links when crawl=true', () => {
    const r = cleanHtml(ARTICLE_HTML, 'https://news.example.com/pride', { crawl: true });
    expect(r.links.flat).toContain('https://news.example.com/events/parade');
    expect(r.links.flat.every((u) => new URL(u).origin === 'https://news.example.com')).toBe(true);
    expect(r.links.external).toContain('https://other.org/external');
  });

  it('returns empty jsonLd when the page has no ld+json', () => {
    const r = cleanHtml(ARTICLE_HTML, 'https://news.example.com/pride');
    expect(r.jsonLd).toEqual([]);
  });
});

const EVENT_HTML = `
<!doctype html><html><head>
  <title>SPA shell</title>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Event","name":"Drag Brunch",
   "startDate":"2026-07-04T12:00","location":{"@type":"Place","name":"The Club","address":"1 Main St"}}
  </script>
  <script type="application/ld+json">{ this is not valid json }</script>
</head><body><div id="root"></div></body></html>`;

const GRAPH_HTML = `
<!doctype html><html><head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"ignore me"},
    {"@type":"LocalBusiness","name":"Rainbow Bar","telephone":"+1 555 0100"}
  ]}
  </script>
</head><body></body></html>`;

describe('cleanHtml jsonLd', () => {
  it('parses Event JSON-LD even when the body is an empty SPA shell, skipping malformed blocks', () => {
    const r = cleanHtml(EVENT_HTML, 'https://tickets.example.com/e/1');
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]['@type']).toBe('Event');
    expect(r.jsonLd[0].name).toBe('Drag Brunch');
  });

  it('flattens @graph and keeps only relevant @types', () => {
    const r = cleanHtml(GRAPH_HTML, 'https://example.com/venue');
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0]['@type']).toBe('LocalBusiness');
    expect(r.jsonLd[0].name).toBe('Rainbow Bar');
  });
});

describe('assertPublicHttpUrl', () => {
  it('accepts a public https url', () => {
    expect(assertPublicHttpUrl('https://queer.guide/x').hostname).toBe('queer.guide');
  });

  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.1/',
    'http://10.0.0.5/',
    'ftp://example.com/',
  ])('rejects %s', (u) => {
    expect(() => assertPublicHttpUrl(u)).toThrow(UnsafeUrlError);
  });
});

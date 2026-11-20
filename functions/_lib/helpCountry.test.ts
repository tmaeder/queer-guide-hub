import { describe, it, expect } from 'vitest';
import {
  buildHelpCountry,
  helpCountryDetail,
  helpCountryCodes,
  helpSitemapEntries,
  HELP_COUNTRY_RE,
  type HelpHotline,
} from './helpCountry';

const LINES: HelpHotline[] = [
  {
    name: 'TelefonSeelsorge',
    country: 'DE',
    phone: '0800 111 0 111',
    hours: '24/7',
    url: 'https://www.telefonseelsorge.de',
    link_status: 'live',
  },
  {
    name: 'Broken Site Line',
    country: 'DE',
    phone: '0800 222',
    url: 'https://dead.example',
    link_status: 'broken',
  },
  { name: 'Unreviewed', country: 'DE', phone: '0800 333', needs_review: true },
  { name: 'Trevor <Project>', country: 'US', phone: '1-866-488-7386' },
  { name: 'Only Review', country: 'FR', needs_review: true },
  { name: 'Worldwide', country: 'INT', url: 'https://int.example' },
];

describe('helpCountry', () => {
  it('matches only two/three-letter codes under /help', () => {
    expect(HELP_COUNTRY_RE.test('/help/de')).toBe(true);
    expect(HELP_COUNTRY_RE.test('/help/int/')).toBe(true);
    expect(HELP_COUNTRY_RE.test('/help/germany')).toBe(false);
    expect(HELP_COUNTRY_RE.test('/help')).toBe(false);
  });

  it('gives a country page its own title and lists that country only', () => {
    const r = buildHelpCountry('de', LINES);
    expect(r.indexable).toBe(true);
    expect(r.meta.title).toBe('LGBTQ+ crisis lines in Germany | Queer Guide');
    expect(r.body).toContain('<h1>LGBTQ+ crisis lines in Germany</h1>');
    expect(r.body).toContain(
      'TelefonSeelsorge — 0800 111 0 111 (24/7) — <a href="https://www.telefonseelsorge.de">website</a>',
    );
    expect(r.body).not.toContain('Trevor');
    expect(r.body).toContain('href="/help"');
  });

  it('stays a subset of the page: no needs_review rows, no broken links', () => {
    const r = buildHelpCountry('DE', LINES);
    expect(r.body).not.toContain('Unreviewed');
    expect(r.body).toContain('Broken Site Line — 0800 222');
    expect(r.body).not.toContain('dead.example');
  });

  it('escapes hotline text', () => {
    expect(buildHelpCountry('us', LINES).body).toContain('Trevor &lt;Project&gt;');
  });

  it('noindexes a code with no publishable lines instead of duplicating /help', () => {
    for (const code of ['fr', 'zz']) {
      const r = buildHelpCountry(code, LINES);
      expect(r.indexable).toBe(false);
      expect(r.meta.title).toBe('LGBTQ+ Crisis Lines and Help Hotlines | Queer Guide');
    }
  });

  it('lists every country with a publishable line in the sitemap', () => {
    expect(helpCountryCodes(LINES)).toEqual(['DE', 'INT', 'US']);
    expect(helpSitemapEntries(LINES, '2026-11-20').map((e) => e.loc)).toEqual([
      'https://queer.guide/help/de',
      'https://queer.guide/help/int',
      'https://queer.guide/help/us',
    ]);
  });

  it('words the international page as "worldwide"', () => {
    expect(buildHelpCountry('int', LINES).meta.title).toBe(
      'LGBTQ+ crisis lines worldwide | Queer Guide',
    );
  });

  it('only indexes the lowercase URL, so /help/DE is never a second copy of /help/de', async () => {
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' } as never;
    const fetchMock = async () =>
      new Response(JSON.stringify([{ body_json: { hotlines: LINES } }]), { status: 200 });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      expect((await helpCountryDetail(env, '/help/de'))?.indexable).toBe(true);
      expect((await helpCountryDetail(env, '/help/DE'))?.indexable).toBe(false);
      expect((await helpCountryDetail(env, '/help/De'))?.indexable).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

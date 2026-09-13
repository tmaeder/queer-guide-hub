import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Typed by the sibling wikipedia-orgs.d.mts so a signature change breaks here
// rather than silently resolving to `any`.
import {
  EXCLUSIONS,
  collapseRecords,
  decideCountry,
  decideLifespan,
  mayAutoMerge,
  resolveCategoryCountry,
  wikidataDate,
  type WikipediaOrgRecord,
} from '../../../scripts/data-quality/lib/wikipedia-orgs.mjs';

const CORPUS = join(process.cwd(), 'scripts/data-quality/out/lgbtq-political-orgs.json');
const corpus: { records: WikipediaOrgRecord[] } = JSON.parse(readFileSync(CORPUS, 'utf8'));

describe('wikidataDate', () => {
  it('keeps a full-precision date', () => {
    expect(wikidataDate('+2011-04-01T00:00:00Z')).toBe('2011-04-01');
  });

  it('does not invent precision for a year-only value', () => {
    // `+1973-00-00` is year precision. The zeros are not January 1st; they mean
    // "month and day unknown". Stored as -01-01 because a date column needs
    // something, but only the year is ever displayed.
    expect(wikidataDate('+1973-00-00T00:00:00Z')).toBe('1973-01-01');
  });

  it('rejects BCE, implausible years and junk', () => {
    expect(wikidataDate('-0500-00-00T00:00:00Z')).toBeNull();
    expect(wikidataDate('+1200-00-00T00:00:00Z')).toBeNull();
    expect(wikidataDate('+9999-00-00T00:00:00Z')).toBeNull();
    expect(wikidataDate('sometime in the 70s')).toBeNull();
    expect(wikidataDate(undefined)).toBeNull();
  });
});

describe('resolveCategoryCountry', () => {
  it('resolves US states and DC to the United States', () => {
    for (const s of [
      'California',
      'Texas',
      'New York (state)',
      'Georgia (U.S. state)',
      'Washington, D.C.',
    ]) {
      expect(resolveCategoryCountry(s)).toBe('United States');
    }
  });

  it('resolves UK constituent countries to the United Kingdom', () => {
    expect(resolveCategoryCountry('Scotland')).toBe('United Kingdom');
  });

  it('strips the definite article the category pattern adds', () => {
    expect(resolveCategoryCountry('the Netherlands')).toBe('Netherlands');
    expect(resolveCategoryCountry('the Republic of Ireland')).toBe('Ireland');
    expect(resolveCategoryCountry('the United States')).toBe('United States');
  });

  it('passes an ordinary country through unchanged', () => {
    expect(resolveCategoryCountry('Japan')).toBe('Japan');
    expect(resolveCategoryCountry('Uganda')).toBe('Uganda');
  });

  it('resolves every country string the real corpus contains', () => {
    // Positive control against the actual data: an unrecognised value would
    // otherwise pass through as a bogus "country" and be filed as one.
    const raw = new Set<string>(corpus.records.flatMap((r) => r.categoryCountries ?? []));
    expect(raw.size).toBeGreaterThan(50);
    for (const value of raw) {
      const resolved = resolveCategoryCountry(value);
      expect(resolved, `${value} did not resolve`).toBeTruthy();
      expect(resolved, `${value} kept its article`).not.toMatch(/^the /);
      expect(resolved, `${value} resolved to a US state`).not.toMatch(/\(U\.S\. state\)|\(state\)/);
    }
  });
});

describe('decideCountry', () => {
  it('reports corroboration when both signals agree', () => {
    const d = decideCountry({ categoryCountries: ['Japan'], p17Labels: ['Japan'] });
    expect(d).toMatchObject({ country: 'Japan', status: 'corroborated' });
  });

  it('resolves the state artifact BEFORE comparing, so it is not a conflict', () => {
    // 79 of 82 raw disagreements are this shape. Treating them as conflicts
    // would bury the 3 real ones.
    const d = decideCountry({ categoryCountries: ['California'], p17Labels: ['United States'] });
    expect(d).toMatchObject({ country: 'United States', status: 'corroborated' });
  });

  it('flags a genuine contradiction and keeps the category answer', () => {
    // Parliamentary League for Considering LGBT Issues: a Japanese Diet caucus
    // whose Wikidata item claims P17 = United States. Wikidata is wrong.
    const d = decideCountry({ categoryCountries: ['Japan'], p17Labels: ['United States'] });
    expect(d.status).toBe('conflict');
    expect(d.country).toBe('Japan');
  });

  it('does not call an article or a capital letter a conflict', () => {
    // Wikipedia categories write "the Bahamas"; the Wikidata label is "The
    // Bahamas". Comparing raw strings reported Rainbow Alliance of The Bahamas
    // as a country conflict and would have refused a correct merge. The article
    // belongs to the two sources' house style, not to the country.
    const d = decideCountry({ categoryCountries: ['the Bahamas'], p17Labels: ['The Bahamas'] });
    expect(d.status).toBe('corroborated');
  });

  it('refuses to pick one country for a multi-country organization', () => {
    // Scientific-Humanitarian Committee: Austria, Germany, the Netherlands.
    const d = decideCountry({
      categoryCountries: ['Austria', 'Germany', 'the Netherlands'],
      p17Labels: ['Germany'],
    });
    expect(d).toMatchObject({ country: null, status: 'multi_country' });
  });

  it('accepts a lone P17 when the category gives nothing, and marks it uncorroborated', () => {
    const d = decideCountry({ categoryCountries: [], p17Labels: ['Spain'] });
    expect(d).toMatchObject({ country: 'Spain', status: 'p17_only' });
  });

  it('resolves to nothing rather than guessing when both signals are silent', () => {
    expect(decideCountry({ categoryCountries: [], p17Labels: [] })).toMatchObject({
      country: null,
      status: 'unresolved',
    });
    // Two P17 countries and no category is not a single answer either.
    expect(
      decideCountry({ categoryCountries: [], p17Labels: ['France', 'Belgium'] }),
    ).toMatchObject({ country: null, status: 'unresolved' });
  });
});

describe('decideLifespan', () => {
  it('treats a Defunct category with no date as defunct', () => {
    const d = decideLifespan({
      paths: ['Category:Defunct LGBTQ political advocacy groups'],
      p576: [],
    });
    expect(d.isDefunct).toBe(true);
    expect(d.dissolvedAt).toBeNull();
    expect(d.defunctSource).toBe('category');
  });

  it('treats a P576 date with no Defunct category as defunct', () => {
    const d = decideLifespan({
      paths: ['Category:LGBTQ political organizations'],
      p576: ['+2014-00-00T00:00:00Z'],
    });
    expect(d.isDefunct).toBe(true);
    expect(d.dissolvedAt).toBe('2014-01-01');
    expect(d.defunctSource).toBe('p576');
  });

  it('leaves a live organization alone', () => {
    const d = decideLifespan({
      paths: ['Category:LGBTQ political organizations'],
      p576: [],
      p571: ['+1990-05-02T00:00:00Z'],
    });
    expect(d).toMatchObject({ isDefunct: false, dissolvedAt: null, foundedAt: '1990-05-02' });
  });
});

describe('mayAutoMerge', () => {
  it('merges when both sides name the same country', () => {
    expect(
      mayAutoMerge({
        wikiCountry: 'Germany',
        wikiCountryStatus: 'corroborated',
        dbCountry: 'Germany',
      }),
    ).toMatchObject({ ok: true });
  });

  it('refuses when either side has no country', () => {
    expect(
      mayAutoMerge({ wikiCountry: null, wikiCountryStatus: 'unresolved', dbCountry: 'Germany' }).ok,
    ).toBe(false);
    expect(
      mayAutoMerge({ wikiCountry: 'Germany', wikiCountryStatus: 'corroborated', dbCountry: null })
        .ok,
    ).toBe(false);
  });

  it('refuses on a country conflict or a multi-country organization', () => {
    expect(
      mayAutoMerge({ wikiCountry: 'Japan', wikiCountryStatus: 'conflict', dbCountry: 'Japan' }).ok,
    ).toBe(false);
    expect(
      mayAutoMerge({
        wikiCountry: 'Germany',
        wikiCountryStatus: 'multi_country',
        dbCountry: 'Germany',
      }).ok,
    ).toBe(false);
  });

  it('refuses across different countries — the namesake case', () => {
    const r = mayAutoMerge({
      wikiCountry: 'Scotland',
      wikiCountryStatus: 'category_only',
      dbCountry: 'Australia',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/country mismatch/);
  });
});

describe('collapseRecords against the real corpus', () => {
  const collapsed = collapseRecords(corpus.records);

  it('collapses redirect pages onto their target by QID', () => {
    // `categorymembers` returns redirects carrying their own category tags.
    // Keyed on title these are four extra organizations; keyed on QID they are
    // the same four.
    const titles = new Set(collapsed.flatMap((r) => r.titles));
    expect(titles.has('Act Up-Paris')).toBe(true);
    expect(titles.has('ACT UP')).toBe(true);
    const actUp = collapsed.filter((r) => r.titles.includes('ACT UP'));
    expect(actUp).toHaveLength(1);
    expect(actUp[0].titles).toHaveLength(2);
    expect(actUp[0].name).toBe('ACT UP');
  });

  it('prefers the Wikidata label, dropping article disambiguators', () => {
    const stonewall = collapsed.find((r) => r.titles.includes('Stonewall (charity)'));
    expect(stonewall?.name).toBe('Stonewall');
  });

  it('drops every excluded title and nothing else', () => {
    const titles = new Set(collapsed.flatMap((r) => r.titles));
    for (const excluded of EXCLUSIONS.keys()) {
      expect(titles.has(excluded), `${excluded} survived exclusion`).toBe(false);
    }
    // Deliberately kept: real organizations that a P31 filter would have dropped.
    for (const kept of [
      'OutNebraska',
      'Janus Society',
      'Human Dignity Trust',
      'SPoD',
      'Rainbow Labour',
    ]) {
      expect(titles.has(kept), `${kept} was wrongly dropped`).toBe(true);
    }
  });

  it('lets no disqualifying P31 class survive, listed or not', () => {
    /**
     * The test above iterates EXCLUSIONS.keys(), so it can only prove the list
     * is APPLIED — never that it is COMPLETE. That gap shipped: `Black Lives
     * Matter` (P31 = social movement) was named as excluded in the design doc
     * and the PR description, was never added to the map, and reached
     * production as an advocacy organization.
     *
     * This asserts the property instead of the list. A class that an
     * organization can never be must not survive collapse, whether or not
     * anyone remembered to name the article.
     */
    const DISQUALIFYING =
      /^(human|social movement|black movement|micronation|kingdom|campaign|election campaign|criminal organization|Wikimedia list article|Wikimedia disambiguation page)$/i;
    const survivors = collapsed
      .filter((r) => (r.p31Labels ?? []).some((l) => DISQUALIFYING.test(l)))
      .map((r) => `${r.name} (${(r.p31Labels ?? []).join(', ')})`);
    expect(survivors).toEqual([]);
  });

  it('the disqualifying-class check is not vacuous', () => {
    // Positive control: the raw corpus really does contain such rows, so the
    // assertion above is doing work rather than filtering an empty set.
    const DISQUALIFYING = /^(human|social movement|micronation|criminal organization)$/i;
    const inRaw = corpus.records.filter((r) =>
      (r.p31Labels ?? []).some((l) => DISQUALIFYING.test(l)),
    );
    expect(inRaw.length).toBeGreaterThan(2);
  });

  it('keeps the one record that has no Wikidata QID', () => {
    // Dolphin Democrats is a real Houston political club with no QID. Keying
    // strictly on QID would silently discard it.
    const titles = new Set(collapsed.flatMap((r) => r.titles));
    expect(titles.has('Dolphin Democrats')).toBe(true);
  });

  it('yields the measured entity count', () => {
    // 426 titles - 4 redirects - 15 exclusions. A change here means the corpus
    // was re-crawled; re-read the exclusion list before updating this number.
    expect(collapsed.length).toBe(426 - 4 - EXCLUSIONS.size);
  });

  it('finds more defunct organizations than either signal alone', () => {
    // The load-bearing measurement: category and P576 overlap on only 5 rows, so
    // either signal alone misses roughly half the dead organizations.
    const lifespans = collapsed.map((r) => decideLifespan(r));
    const defunct = lifespans.filter((l) => l.isDefunct);
    const byCategory = lifespans.filter((l) => l.defunctSource === 'category').length;
    const byP576 = lifespans.filter((l) => l.defunctSource === 'p576').length;
    const both = lifespans.filter((l) => l.defunctSource === 'both').length;

    expect(defunct.length).toBeGreaterThan(40);
    expect(both).toBeLessThan(10);
    // Neither signal on its own comes close to the union.
    expect(byCategory + both).toBeLessThan(defunct.length);
    expect(byP576 + both).toBeLessThan(defunct.length);
  });

  it('resolves a country for the large majority, and conflicts stay rare', () => {
    const decided = collapsed.map((r) => decideCountry(r));
    const resolved = decided.filter((d) => d.country).length;
    const conflicts = decided.filter((d) => d.status === 'conflict');

    expect(resolved / collapsed.length).toBeGreaterThan(0.85);
    // Before state resolution this was 82. If this climbs back into the dozens,
    // the SUBNATIONAL map has gone stale against a re-crawled corpus.
    expect(conflicts.length).toBeLessThan(10);
  });
});

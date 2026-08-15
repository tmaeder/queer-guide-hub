import { describe, it, expect } from 'vitest';
import { buildTagJsonLd } from '../tagJsonLd';
import type { TagLegalSourceRow } from '@/hooks/usePageFetchers';

const TAG = {
  name: 'Anti-Homosexuality Act',
  slug: 'uganda-anti-homosexuality-act',
  description: 'A Ugandan statute.',
  wikipedia_url: 'https://en.wikipedia.org/wiki/Anti-Homosexuality_Act,_2023',
};

const source = (over: Partial<TagLegalSourceRow> = {}): TagLegalSourceRow => ({
  id: 's1',
  source_type: 'statute',
  source_url: 'https://ulii.org/akn/ug/act/2023/1',
  official_title: 'The Anti-Homosexuality Act, 2023',
  jurisdiction: 'UG',
  adopted_year: 2023,
  instrument_status: 'in_force',
  claim_summary: null,
  verified_at: null,
  ...over,
});

describe('buildTagJsonLd', () => {
  it('emits a DefinedTerm with no citation when there are no legal sources', () => {
    const ld = buildTagJsonLd(TAG);
    expect(ld['@type']).toBe('DefinedTerm');
    expect(ld.citation).toBeUndefined();
  });

  it('keeps sameAs a bare string when Wikipedia is the only external identity', () => {
    // Regression guard for the other ~2,500 non-law tags.
    expect(buildTagJsonLd(TAG).sameAs).toBe(TAG.wikipedia_url);
  });

  it('promotes sameAs to an array once a statute URL joins it', () => {
    const ld = buildTagJsonLd(TAG, [source()]);
    expect(ld.sameAs).toEqual([TAG.wikipedia_url, 'https://ulii.org/akn/ug/act/2023/1']);
  });

  it('emits a Legislation citation carrying title, url and jurisdiction', () => {
    const ld = buildTagJsonLd(TAG, [source()]);
    expect(ld.citation).toEqual([
      {
        '@type': 'Legislation',
        name: 'The Anti-Homosexuality Act, 2023',
        url: 'https://ulii.org/akn/ug/act/2023/1',
        legislationJurisdiction: 'UG',
      },
    ]);
  });

  it('never emits legislationDate', () => {
    // schema.org types it as a Date; we hold only a year, and "2023" would assert
    // a precision we do not have.
    const ld = buildTagJsonLd(TAG, [source()]);
    expect(JSON.stringify(ld)).not.toContain('legislationDate');
  });

  it('drops a source missing its title or url from both sameAs and citation', () => {
    const ld = buildTagJsonLd(TAG, [
      source({ id: 'a', official_title: null }),
      source({ id: 'b', source_url: null }),
    ]);
    expect(ld.citation).toBeUndefined();
    expect(ld.sameAs).toBe(TAG.wikipedia_url);
  });

  it('handles a tag with no Wikipedia link but a citation', () => {
    const ld = buildTagJsonLd({ ...TAG, wikipedia_url: null }, [source()]);
    expect(ld.sameAs).toBe('https://ulii.org/akn/ug/act/2023/1');
  });
});

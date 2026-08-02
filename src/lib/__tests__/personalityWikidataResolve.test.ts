// Guards for the namesake-chimera fix (2026-08).
//
// Four edge functions resolved Wikidata QIDs by bare name and took search[0],
// binding adult performers to their famous namesakes and copying the stranger's
// birth date, death date and social handles onto the record. 59.7% of the adult
// cohort's QIDs were wrong.
//
// These tests live under src/ deliberately: vitest's `include` in vite.config.ts
// is `src/**/*.{test,spec}.{ts,tsx}`, so tests placed next to the modules in
// supabase/functions/_shared/ never execute. (Ten such files exist and have
// never run — tracked separately.) The modules are plain ESM/TS and import fine
// from here.

import { describe, it, expect } from 'vitest';

import {
  keywordsFor,
  hasProfessionMapping,
  scoreOccupationMatch,
  PROFESSION_KEYWORDS,
  PROFESSION_ALIASES,
} from '../../../supabase/functions/_shared/profession-keywords.js';

import { readTimeClaim, readClaim, readClaimIds }
  from '../../../supabase/functions/_shared/wikidata-resolve';

// Build a minimal Wikidata entity fixture.
function entity(claims: Record<string, unknown[]>) {
  return { claims } as Record<string, unknown>;
}
function timeStatement(time: string, precision: number, rank = 'normal') {
  return { rank, mainsnak: { datavalue: { value: { time, precision } } } };
}
function idStatement(id: string, rank = 'normal') {
  return { rank, mainsnak: { datavalue: { value: { id } } } };
}

describe('profession keywords', () => {
  it('maps English professions to occupation keywords', () => {
    expect(keywordsFor('Adult performer')).toContain('porn');
    expect(keywordsFor('Drag queen')).toContain('drag');
  });

  it('maps German professions, which are ~a third of the corpus', () => {
    // Values must be ENGLISH — they are matched against P106 labels fetched
    // with languages=en.
    expect(keywordsFor('Schriftsteller/in')).toContain('writer');
    expect(keywordsFor('Politiker/in')).toContain('politician');
    expect(keywordsFor('Maler/in')).toContain('painter');
    expect(keywordsFor('Sänger/in')).toContain('singer');
    expect(keywordsFor('Lyriker:in')).toContain('poet');
    expect(keywordsFor('Schriftstellerin')).toContain('writer');
  });

  it('unions keyword sets across ";" and "," separated professions', () => {
    const kws = keywordsFor('Journalist/in; Schriftsteller/in');
    expect(kws).toContain('journalist');
    expect(kws).toContain('writer');

    const dance = keywordsFor('Tänzer/in, Choreograf/in');
    expect(dance).toContain('dancer');
    expect(dance).toContain('choreographer');
  });

  it('reports unmapped professions so callers do not treat them as conflicts', () => {
    // This is the guard that keeps the German cohort out of the destructive
    // path: an unmappable profession is "unverifiable", never "conflict".
    expect(hasProfessionMapping('Adult performer')).toBe(true);
    expect(hasProfessionMapping('Schriftsteller/in')).toBe(true);
    expect(hasProfessionMapping('Kartograph des Zaren')).toBe(false);
    expect(hasProfessionMapping('')).toBe(false);
    expect(hasProfessionMapping(null)).toBe(false);
  });

  it('resolves every alias to a real keyword set (no dangling targets)', () => {
    for (const [alias, target] of Object.entries(PROFESSION_ALIASES)) {
      expect(PROFESSION_KEYWORDS[target], `alias "${alias}" → missing key "${target}"`)
        .toBeDefined();
    }
  });

  it('never defines a term as both a direct key and an alias', () => {
    // lookup() consults PROFESSION_KEYWORDS first, so a term in both tables
    // silently ignores its alias. 'wrestler' was in both and kept the narrow
    // two-word list instead of inheriting the full athlete set.
    for (const alias of Object.keys(PROFESSION_ALIASES)) {
      expect(PROFESSION_KEYWORDS[alias], `"${alias}" is both a key and an alias`)
        .toBeUndefined();
    }
  });

  it('gives an alias EXACTLY its target keyword list', () => {
    // The regression this guards: German entries were once duplicate lists and
    // drifted narrower than their English equivalents — 'sportler' lacked
    // boxer/equestrian, so Irma Testa ("Italian boxer") and Hans Peter
    // Minderhoud ("equestrian") scored as namesake conflicts despite being the
    // right person. Aliasing means one list per concept; this asserts it stays
    // that way.
    for (const [alias, target] of Object.entries(PROFESSION_ALIASES)) {
      expect(keywordsFor(alias), `alias "${alias}"`).toEqual(PROFESSION_KEYWORDS[target]);
    }
  });

  it('matches the athlete disciplines that broke before', () => {
    const kws = keywordsFor('Sportler/in');
    expect(scoreOccupationMatch(['boxer'], kws)).toBeGreaterThan(0);
    expect(scoreOccupationMatch(['equestrian'], kws)).toBeGreaterThan(0);
    // …without becoming a catch-all: an astrophysicist is still not an athlete.
    expect(scoreOccupationMatch(['astrophysicist'], kws)).toBe(0);
  });

  it('scores occupation overlap', () => {
    expect(scoreOccupationMatch(['pornographic actor'], ['porn'])).toBeGreaterThan(0);
    // The real failure: an astrophysicist scored against an adult performer.
    expect(scoreOccupationMatch(
      ['astronomer', 'astrophysicist', 'writer'],
      ['porn', 'adult', 'erotic', 'escort', 'pornographic'],
    )).toBe(0);
  });
});

describe('readTimeClaim — precision', () => {
  it('reads a day-precision date exactly', () => {
    const e = entity({ P569: [timeStatement('+1968-09-01T00:00:00Z', 11)] });
    expect(readTimeClaim(e, 'P569')).toMatchObject({ date: '1968-09-01', exact: true });
  });

  it('refuses coarser-than-year precision instead of inventing Jan 1', () => {
    // "+1800-00-00T00:00:00Z" at century precision must NOT become 1800-01-01.
    const century = entity({ P569: [timeStatement('+1800-00-00T00:00:00Z', 7)] });
    expect(readTimeClaim(century, 'P569')).toBeNull();

    const decade = entity({ P569: [timeStatement('+1890-00-00T00:00:00Z', 8)] });
    expect(readTimeClaim(decade, 'P569')).toBeNull();
  });

  it('pads month/day at year precision but marks the value inexact', () => {
    const e = entity({ P569: [timeStatement('+1943-00-00T00:00:00Z', 9)] });
    expect(readTimeClaim(e, 'P569')).toMatchObject({ date: '1943-01-01', exact: false });
  });

  it('refuses BCE times rather than slicing them into a bogus CE year', () => {
    // substring(1, 11) on this yielded "500-01-01".
    const e = entity({ P569: [timeStatement('-0500-01-01T00:00:00Z', 11)] });
    expect(readTimeClaim(e, 'P569')).toBeNull();
  });

  it('returns null for somevalue/novalue snaks (no datavalue)', () => {
    const e = entity({ P569: [{ rank: 'normal', mainsnak: { snaktype: 'somevalue' } }] });
    expect(readTimeClaim(e, 'P569')).toBeNull();
  });
});

describe('readTimeClaim / readClaim — rank', () => {
  it('prefers the preferred statement over array position', () => {
    const e = entity({
      P569: [
        timeStatement('+1905-01-01T00:00:00Z', 11, 'normal'),
        timeStatement('+1968-09-01T00:00:00Z', 11, 'preferred'),
      ],
    });
    expect(readTimeClaim(e, 'P569')?.date).toBe('1968-09-01');
  });

  it('drops deprecated statements entirely', () => {
    const e = entity({
      P569: [
        timeStatement('+1905-01-01T00:00:00Z', 11, 'deprecated'),
        timeStatement('+1968-09-01T00:00:00Z', 11, 'normal'),
      ],
    });
    expect(readTimeClaim(e, 'P569')?.date).toBe('1968-09-01');

    const onlyDeprecated = entity({ P569: [timeStatement('+1905-01-01T00:00:00Z', 11, 'deprecated')] });
    expect(readTimeClaim(onlyDeprecated, 'P569')).toBeNull();
  });

  it('applies rank to id-valued claims too', () => {
    const e = entity({
      P106: [idStatement('Q82955', 'deprecated'), idStatement('Q488111', 'preferred')],
    });
    expect(readClaimIds(e, 'P106')).toEqual(['Q488111']);
    expect(readClaim(e, 'P106')).toBe('Q488111');
  });

  it('returns an empty list for an absent property', () => {
    expect(readClaimIds(entity({}), 'P106')).toEqual([]);
    expect(readClaim(entity({}), 'P18')).toBeNull();
  });
});

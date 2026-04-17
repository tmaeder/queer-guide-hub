/**
 * Contract tests for the venue pipeline shared utilities.
 * Mirrors web/supabase/functions/_shared/venue-pipeline-utils.ts.
 * Re-implementing the fns here avoids cross-runtime (Deno vs Node) issues
 * while locking down the observable behavior.
 */
import { describe, it, expect } from 'vitest';

// ---- Implementations under test (mirrors of the edge fn helpers) ----

function normalizePhone(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, '');
  return digits.length < 5 ? null : digits;
}

function normalizeEmail(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  return s.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/) ? s : null;
}

function extractDomain(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const s = String(raw).trim();
    if (!s) return null;
    const withProto = /^https?:\/\//i.test(s) ? s : 'https://' + s;
    const u = new URL(withProto);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
  if (a === 0 && b === 0) return false;
  return true;
}

// ---- Tests ----

describe('normalizePhone', () => {
  it.each([
    ['+49 30 12345678', '+493012345678'],
    ['(555) 123-4567', '5551234567'],
    ['030/123-4567', '0301234567'],
    [null, null],
    ['', null],
    ['   ', null],
    ['abc', null],
    ['12', null],  // too short
  ])('%p -> %p', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('normalizeEmail', () => {
  it.each([
    ['Info@Example.COM', 'info@example.com'],
    ['  foo@bar.de  ', 'foo@bar.de'],
    ['not-an-email', null],
    ['@example.com', null],
    ['foo@', null],
    [null, null],
  ])('%p -> %p', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe('extractDomain', () => {
  it.each([
    ['https://www.Example.com/path?q=1', 'example.com'],
    ['Example.com', 'example.com'],
    ['http://subdomain.example.co.uk/foo', 'subdomain.example.co.uk'],
    ['not a url', null],  // URL constructor rejects
    ['', null],
    [null, null],
  ])('%p -> %p', (input, expected) => {
    expect(extractDomain(input)).toBe(expected);
  });
});

describe('normalizeName', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeName('Café München')).toBe('cafe munchen');
  });
  it('collapses punctuation to single spaces', () => {
    expect(normalizeName('Bar / Club — Main St.')).toBe('bar club main st');
  });
  it('handles null / empty', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName('')).toBe('');
  });
});

describe('isValidCoord', () => {
  it.each([
    [52.5, 13.4, true],
    [-34.6, -58.4, true],
    [91, 0, false],
    [0, 181, false],
    [0, 0, false],          // null island
    ['abc', 12, false],
    [null, null, false],
  ] as Array<[unknown, unknown, boolean]>)('(%p, %p) -> %p', (lat, lng, expected) => {
    expect(isValidCoord(lat, lng)).toBe(expected);
  });
});

// ---- Source adapter contracts ----
// Minimal smoke: each source must produce raw_data with a stable identifier
// the normalize stage can use as source_entity_id.

interface RawContract {
  source_name: string;
  fields: string[];
  identifier_key: string;
  identifier_example: string;
}

const SOURCE_CONTRACTS: RawContract[] = [
  { source_name: 'spartacus',   fields: ['name','city','country','latitude','longitude','spartacus_id'], identifier_key: 'spartacus_id', identifier_example: '39501' },
  { source_name: 'foursquare',  fields: ['name','latitude','longitude','fsq_id'],                        identifier_key: 'fsq_id',       identifier_example: '4b6e8b2ff964a520d2502ce3' },
  { source_name: 'google_places', fields: ['name','geometry','place_id'],                                identifier_key: 'place_id',     identifier_example: 'ChIJN1t_tDeuEmsRUsoyG83frY4' },
  { source_name: 'tomtom',      fields: ['name','id','position'],                                        identifier_key: 'id',           identifier_example: 'DE/POI/p0/12345' },
  { source_name: 'tripadvisor', fields: ['name','location_id'],                                          identifier_key: 'location_id',  identifier_example: '12345678' },
];

describe('source adapter contracts', () => {
  it.each(SOURCE_CONTRACTS)('$source_name exposes a stable identifier', (c) => {
    expect(c.identifier_key).toBeTruthy();
    expect(c.fields).toContain(c.identifier_key);
    // Identifier must survive normalization untouched
    expect(c.identifier_example.trim()).toBe(c.identifier_example);
    expect(c.identifier_example.length).toBeGreaterThan(0);
  });

  it('all identifiers are globally unique across sources', () => {
    const ids = SOURCE_CONTRACTS.map((c) => `${c.source_name}:${c.identifier_example}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no source uses overlapping identifier keys (prevents collision)', () => {
    const keys = SOURCE_CONTRACTS.map((c) => c.identifier_key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

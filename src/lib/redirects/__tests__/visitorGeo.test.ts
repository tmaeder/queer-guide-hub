import { describe, expect, it } from 'vitest';
import {
  forwardVisitorGeo,
  readVisitorGeo,
} from '../../../../supabase/functions/_shared/redirect-visitor-geo';
import { visitorMetadata } from '../../../../supabase/functions/_shared/redirect-visitor';

describe('visitor geography across the HTTP relay', () => {
  it.each(['Zürich', 'São Paulo', '東京', 'Łódź', '100% genuine', 'A%20B'])(
    'preserves %s through a byte-only HTTP hop',
    (city) => {
      const headers = new Headers();
      forwardVisitorGeo(headers, { city, region: 'Île-de-France', continent: 'EU' });
      // Simulate a transport reading UTF-8 header bytes as Latin-1. The encoded
      // headers stay ASCII and therefore survive unchanged through either runtime.
      const wire = new Headers();
      for (const [key, value] of headers) {
        wire.set(
          key,
          Array.from(new TextEncoder().encode(value), (n) => String.fromCharCode(n)).join(''),
        );
      }
      expect(
        visitorMetadata(new Request('https://example.org', { headers: wire }), true),
      ).toMatchObject({ city, region: 'Île-de-France', continent: 'EU', is_qr: true });
      if (/[^\x20-\x7e]/.test(city)) expect(headers.has('x-qg-visitor-city')).toBe(false);
    },
  );
  it('accepts old headers without reinterpreting literal percent escapes', () => {
    expect(readVisitorGeo(new Headers({ 'x-qg-visitor-city': 'A%20B' }), 'city')).toBe('A%20B');
  });
  it('rejects malformed encoded metadata and never falls back to a spoofed old value', () => {
    expect(
      readVisitorGeo(
        new Headers({ 'x-qg-visitor-city': 'Forged', 'x-qg-visitor-city-utf8': '%XX' }),
        'city',
      ),
    ).toBeNull();
    expect(
      readVisitorGeo(new Headers({ 'x-qg-visitor-city-utf8': 'x'.repeat(1537) }), 'city'),
    ).toBeNull();
  });
  it('strips controls, bounds names and clears stale input even with absent or malformed geography', () => {
    const headers = new Headers({
      'x-qg-visitor-city': 'Forged',
      'x-qg-visitor-city-utf8': 'Forged',
    });
    forwardVisitorGeo(headers);
    expect(readVisitorGeo(headers, 'city')).toBeNull();
    forwardVisitorGeo(headers, { city: '東京'.repeat(100) + '\n', region: '\ud800' });
    expect(readVisitorGeo(headers, 'city')).toBe('東京'.repeat(64));
    expect(readVisitorGeo(headers, 'region')).toBeNull();
    forwardVisitorGeo(headers, { city: 'A\nB\rC\u007fD' });
    expect(readVisitorGeo(headers, 'city')).toBe('ABCD');
  });
});

import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '../serializeJsonLd';

describe('serializeJsonLd', () => {
  const hostile = { name: '</script><script>alert(1)</script>', note: 'a & b > c' };

  it('cannot close the surrounding script element', () => {
    const out = serializeJsonLd(hostile);
    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain('\\u003c/script\\u003e');
  });

  it('round-trips to the original value', () => {
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
  });

  it('is plain JSON.stringify when nothing needs escaping', () => {
    const safe = { '@type': 'WebSite', url: 'https://queer.guide/' };
    expect(serializeJsonLd(safe)).toBe(JSON.stringify(safe));
  });
});

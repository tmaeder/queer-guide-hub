import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { buildCampaignDestination, publicSourceUrl, summariseVisits } from '../linkTools';
import { manualRedirect } from '../inventory';

describe('campaign link tools', () => {
  it('preserves query parameters/fragments and encodes prefill/campaign values safely', () => {
    const destination = buildCampaignDestination(
      '/contribute?type=event#details',
      { utm_campaign: 'Pride Zürich & friends' },
      [{ key: 'title', value: 'A & B = C?' }],
    );
    const url = new URL(destination, 'https://queer.guide');
    expect(url.searchParams.get('type')).toBe('event');
    expect(url.searchParams.get('title')).toBe('A & B = C?');
    expect(url.searchParams.get('utm_campaign')).toBe('Pride Zürich & friends');
    expect(url.hash).toBe('#details');
  });
  it('rejects loops, unsupported hosts, unresolved patterns, and duplicate parameters', () => {
    for (const target of [
      '/go/promo',
      '/events/:slug',
      '/events/*',
      '//evil.example',
      'javascript:alert(1)',
      'https://evil.example',
    ])
      expect(() => buildCampaignDestination(target, {}, [])).toThrow();
    expect(() =>
      buildCampaignDestination('/events', {}, [
        { key: 'name', value: 'A' },
        { key: 'name', value: 'B' },
      ]),
    ).toThrow('more than once');
    expect(publicSourceUrl('/events/:slug')).toBeNull();
    expect(publicSourceUrl('@oldname')).toBeNull();
    expect(publicSourceUrl('/\\evil.example')).toBeNull();
  });
  it('prefills campaign settings and overrides from managed rules without changing the stored target', () => {
    expect(
      manualRedirect({
        id: '1',
        target: '/events?utm_source=poster',
        utm_defaults: { utm_source: 'default', utm_medium: 'print' },
        query_mode: 'OVERRIDE',
        query_override: { type: 'event' },
        click_count: 17,
      }),
    ).toMatchObject({
      campaign: { utm_source: 'poster', utm_medium: 'print' },
      prefill: { type: 'event' },
      clicks: 17,
    });
  });
  it('generates a QR symbol that an independent decoder reads as the exact share URL', async () => {
    const value = 'https://queer.guide/go/pride-zurich?utm_source=qr';
    const code = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const width = (code.modules.size + 8) * 8;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const mx = Math.floor(x / 8) - 4,
          my = Math.floor(y / 8) - 4;
        if (
          mx >= 0 &&
          my >= 0 &&
          mx < code.modules.size &&
          my < code.modules.size &&
          code.modules.get(my, mx)
        ) {
          const offset = (y * width + x) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
      }
    expect(jsQR(pixels, width, width)?.data).toBe(value);
    expect(await QRCode.toString(value, { type: 'svg', margin: 4 })).toContain('<svg');
  });
  it('counts visits by UTC date, country, and referrer host without exposing referrer query parameters', () => {
    const summaries = summariseVisits([
      {
        id: 1,
        ts: '2026-10-13T00:00:00Z',
        country: 'CH',
        referer: 'https://example.com/private?email=hidden',
        status: 302,
      },
      { id: 2, ts: '2026-10-13T08:00:00Z', country: null, referer: null, status: 302 },
    ]);
    expect(summaries.daily).toEqual([['2026-10-13', 2]]);
    expect(summaries.referrers).toContainEqual(['example.com', 1]);
    expect(summaries.referrers).toContainEqual(['Direct / unknown', 1]);
  });
});

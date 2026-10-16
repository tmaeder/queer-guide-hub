import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  qrPublicationInput,
  validateQrImageUrls,
  readQrImages,
  previewHostedQr,
} from '../qrImages';
import { DEFAULT_QR_STYLE } from '../qr';
import { memberRedirectApi } from '../memberApi';
vi.mock('../memberApi', () => ({ memberRedirectApi: vi.fn() }));
const id = '00000000-0000-4000-8000-000000000001';
const token = 'qg_qr_' + 'a'.repeat(64);
const image = () => ({
  id,
  version: id,
  state: 'published' as const,
  imageUrls: Object.fromEntries(
    ['png', 'jpg', 'svg'].map((format) => [
      format,
      'https://queer.guide/api/qr?' + new URLSearchParams({ share: token, format }),
    ]),
  ),
});
const input = {
  url: 'https://queer.guide/go/demo',
  linkId: id,
  label: 'Newsletter',
  days: 0,
  followSaved: true,
  style: DEFAULT_QR_STYLE,
  logoMode: 'saved' as const,
};
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe('hosted QR UI contracts', () => {
  it('publishes managed IDs with live appearance and explicit URLs with fixed appearance', () => {
    expect(qrPublicationInput(input)).toEqual({
      linkId: id,
      label: 'Newsletter',
      expiresAt: null,
      style: null,
      logoMode: 'inherit',
    });
    expect(
      qrPublicationInput({ ...input, linkId: undefined, followSaved: false, logoMode: 'none' }),
    ).toMatchObject({ url: input.url, style: DEFAULT_QR_STYLE, logoMode: 'none' });
  });
  it('keeps install purpose and public campaign query attached to managed hosted images', () => {
    expect(
      qrPublicationInput({
        ...input,
        purpose: 'install',
        url: input.url + '?qg_handoff=install&utm_source=poster&ref=print%2Bcommunity',
      }),
    ).toMatchObject({
      linkId: id,
      purpose: 'install',
      entryQuery: 'utm_source=poster&ref=print%2Bcommunity',
    });
    expect(() => qrPublicationInput({ ...input, linkId: undefined, purpose: 'install' })).toThrow(
      'managed link',
    );
  });
  it('separates per-image custom bytes from appearance and saved branding', () => {
    const result = qrPublicationInput({
      ...input,
      days: 30,
      followSaved: false,
      logoMode: 'custom',
      style: { ...DEFAULT_QR_STYLE, logo: 'data:image/png;base64,YWJj' },
    });
    expect(result).toMatchObject({ logo: 'YWJj', logoMode: 'custom', style: DEFAULT_QR_STYLE });
    expect(result.style).not.toHaveProperty('logo');
    expect(Date.parse(result.expiresAt!) - Date.now()).toBeGreaterThan(29 * 86400000);
    expect(() => qrPublicationInput({ ...input, logoMode: 'custom' })).toThrow('artwork');
    expect(() => qrPublicationInput({ ...input, label: ' ' })).toThrow('label');
  });
  it('accepts only same-capability fixed-origin image URLs with no extra parameters', () => {
    const valid = image();
    expect(validateQrImageUrls(valid as never)).toBe(valid);
    for (const bad of [
      { ...valid, state: 'pending' },
      { ...valid, imageUrls: { ...valid.imageUrls, png: 'https://evil.example/api/qr' } },
      {
        ...valid,
        imageUrls: { ...valid.imageUrls, png: valid.imageUrls.png + '&url=https://evil.example' },
      },
      {
        ...valid,
        imageUrls: {
          ...valid.imageUrls,
          jpg: valid.imageUrls.jpg.replace(token, 'qg_qr_' + 'b'.repeat(64)),
        },
      },
    ])
      expect(() => validateQrImageUrls(bad as never)).toThrow();
  });
  it('rejects pagination loops, repeated IDs and reversed pages', async () => {
    const api = vi.mocked(memberRedirectApi);
    const row = { id, version: id, label: 'Image', state: 'published' };
    for (const page of [
      { data: [row], nextCursor: id },
      { data: [row, row], nextCursor: null },
      { data: [], nextCursor: id },
    ]) {
      api.mockResolvedValueOnce(page);
      await expect(readQrImages(id, new AbortController().signal)).rejects.toThrow();
    }
    api.mockResolvedValueOnce({ data: [row], nextCursor: null });
    await expect(readQrImages(null, new AbortController().signal)).resolves.toMatchObject({
      data: [row],
    });
  });
  it('does not trust HTML, unattested PNG or oversized preview bodies', async () => {
    for (const response of [
      new Response('<html>no</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('png', { headers: { 'Content-Type': 'image/png' } }),
      new Response(new Uint8Array(1500001), {
        headers: { 'Content-Type': 'image/png', 'X-QG-QR-Verified': '1' },
      }),
    ]) {
      const fetcher = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', fetcher);
      await expect(
        previewHostedQr(image().imageUrls.png, input.url, new AbortController().signal),
      ).rejects.toThrow();
      expect(fetcher.mock.calls[0][1]).toMatchObject({
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    }
  });
});

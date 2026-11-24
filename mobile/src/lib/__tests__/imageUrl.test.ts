import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MERCHANT_HOSTS, resizedImageUrl } from '../imageUrl';

const COVER = 'https://agwpullzone.b-cdn.net/venuecoverphoto/28b62310/58f6a3e5';

describe('resizedImageUrl', () => {
  it('routes an https photo through the resizer at width × scale, rounded to 50px', () => {
    expect(resizedImageUrl(COVER, 390, 3)).toBe(
      `https://img.queer.guide/cdn-cgi/image/width=1150,quality=80,format=webp/${COVER}`,
    );
  });

  it('caps the requested width so a large tablet does not ask for the original', () => {
    expect(resizedImageUrl(COVER, 1366, 2)).toContain('width=1600,');
  });

  it('caps the device scale at 3', () => {
    expect(resizedImageUrl(COVER, 400, 4)).toBe(resizedImageUrl(COVER, 400, 3));
  });

  it.each([
    'http://example.com/a.jpg',
    'https://cdn.shopify.com/s/files/x.jpg',
    'https://shop.misterb.com/x.jpg',
    'https://abc.supabase.co/storage/v1/render/image/public/x.jpg',
    `https://img.queer.guide/cdn-cgi/image/width=400/${COVER}`,
    'not a url',
  ])('leaves %s unchanged', (url) => {
    expect(resizedImageUrl(url, 390, 2)).toBe(url);
  });
});

/**
 * The deny lists exist because those hosts refuse Cloudflare's fetcher; the web
 * learned each entry the hard way. Read the real web sources so a host added
 * there and not here fails this test instead of shipping blank heroes.
 *
 * CF_FETCH_DENY_HOSTS has no web twin any more: the web now sends external
 * images through the R2 pull-through and dropped its denylist (#5600). The app
 * still resizes external URLs directly, so it keeps its own list.
 */
describe('deny lists match the web', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../../../../', p), 'utf8');
  const listIn = (src: string, name: string): string[] => {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    if (!m) throw new Error(`${name} not found`);
    return [...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1] ?? '').sort();
  };

  it('MERCHANT_HOSTS', () => {
    const web = listIn(read('src/utils/imageHost.ts'), 'MERCHANT_HOSTS');
    expect(web.length).toBeGreaterThan(0);
    expect([...MERCHANT_HOSTS].sort()).toEqual(web);
  });
});

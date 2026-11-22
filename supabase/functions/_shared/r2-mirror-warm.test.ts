import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { r2RemoteUrl, warmImagesInR2 } from './r2-mirror-warm.ts';

Deno.test('encodes exactly like the client toR2ImageUrl (base64url of the normalised URL)', () => {
  const src = 'https://scontent.cdninstagram.com/v/a b.jpg?oe=6AE07ABC&x=1';
  const token = r2RemoteUrl(src)!.split('/r/')[1];
  const decoded = new TextDecoder().decode(
    Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (token.length % 4)) % 4)), (c) => c.charCodeAt(0)),
  );
  assertEquals(decoded, new URL(src).href);
});

Deno.test('skips R2, non-http and junk; HEADs each distinct image once', async () => {
  const calls: string[] = [];
  const fetcher = ((u: string, init: RequestInit) => {
    calls.push(`${init.method} ${u}`);
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;
  const ok = await warmImagesInR2(
    ['https://a.example/x.jpg', 'https://a.example/x.jpg', 'https://img.queer.guide/y.jpg', 'data:image/png;base64,AA', 'not a url'],
    fetcher,
  );
  assertEquals(ok, 1);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].startsWith('HEAD https://img.queer.guide/r/'), true);
});

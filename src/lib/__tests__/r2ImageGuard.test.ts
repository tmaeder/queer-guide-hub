import { describe, expect, it } from 'vitest';
import { installR2ImageGuard } from '@/lib/r2ImageGuard';
import { toR2ImageUrl, toR2SrcSet } from '@/utils/imageHost';
import { buildCfImageUrl } from '@/utils/cloudflareOptimizations';

const EXT = 'https://i.guim.co.uk/img/media/abc.jpg?width=1200';

describe('toR2ImageUrl', () => {
  it('routes external hosts through the R2 pull-through', () => {
    expect(toR2ImageUrl(EXT)).toMatch(/^https:\/\/img\.queer\.guide\/r\/[A-Za-z0-9_-]+$/);
    expect(
      toR2ImageUrl('https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/x.png'),
    ).toMatch(/\/r\//);
    // A content bucket under a widget company's domain is still content.
    expect(toR2ImageUrl('https://qc-social.storage.googleapis.com/uploads/a.jpg')).toMatch(/\/r\//);
    expect(toR2ImageUrl('https://lh3.googleusercontent.com/abc=w400')).toMatch(/\/r\//);
  });
  it('leaves R2, same-origin, data/blob and widget infrastructure alone', () => {
    for (const u of [
      'https://img.queer.guide/a.jpg',
      '/images/hero.jpg',
      'data:image/png;base64,AA',
      'blob:https://queer.guide/1',
      'https://maps.gstatic.com/tile.png',
      'https://www.google-analytics.com/collect',
    ])
      expect(toR2ImageUrl(u)).toBe(u);
  });
  it('re-points the external source of a stored cdn-cgi resize wrapper', () => {
    const wrapped = `https://img.queer.guide/cdn-cgi/image/width=400/${EXT}`;
    expect(toR2ImageUrl(wrapped)).toBe(
      `https://img.queer.guide/cdn-cgi/image/width=400/${toR2ImageUrl(EXT)}`,
    );
    const internal =
      'https://img.queer.guide/cdn-cgi/image/width=400/https://img.queer.guide/x.jpg';
    expect(toR2ImageUrl(internal)).toBe(internal);
  });
  it('never routes private (signed/authenticated) storage URLs through the public mirror', () => {
    for (const u of [
      'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/sign/user-photos/a.jpg?token=abc',
      'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/authenticated/trip-docs/b.png',
      'https://bucket.s3.amazonaws.com/x.jpg?X-Amz-Signature=deadbeef',
    ])
      expect(toR2ImageUrl(u)).toBe(u);
  });
  it('rewrites each srcset candidate', () => {
    expect(toR2SrcSet(`${EXT} 400w, https://img.queer.guide/b.jpg 800w`)).toMatch(
      /^https:\/\/img\.queer\.guide\/r\/\S+ 400w, https:\/\/img\.queer\.guide\/b\.jpg 800w$/,
    );
  });
  it('CF resizing always reads the R2 copy, never the external host', () => {
    const resized = buildCfImageUrl(EXT, { width: 400 });
    expect(resized).toMatch(
      /^https:\/\/img\.queer\.guide\/cdn-cgi\/image\/[^/]+\/https:\/\/img\.queer\.guide\/r\//,
    );
    expect(resized).not.toContain('guim.co.uk');
  });
});

describe('installR2ImageGuard', () => {
  installR2ImageGuard();
  it('rewrites src via setAttribute (React) and the property setter', () => {
    const a = document.createElement('img');
    a.setAttribute('src', EXT);
    expect(a.getAttribute('src')).toBe(toR2ImageUrl(EXT));
    const b = new Image();
    b.src = EXT;
    expect(b.getAttribute('src')).toBe(toR2ImageUrl(EXT));
    const c = document.createElement('source');
    c.setAttribute('srcset', `${EXT} 1x`);
    expect(c.getAttribute('srcset')).toBe(`${toR2ImageUrl(EXT)} 1x`);
  });
  it('rewrites images inside HTML strings assigned to innerHTML', () => {
    const div = document.createElement('div');
    div.innerHTML = `<p>x</p><img src="${EXT}"><picture><source srcset="${EXT} 2x"></picture><video poster="${EXT}"></video>`;
    expect(div.querySelector('img')!.getAttribute('src')).toBe(toR2ImageUrl(EXT));
    expect(div.querySelector('source')!.getAttribute('srcset')).toBe(`${toR2ImageUrl(EXT)} 2x`);
    expect(div.querySelector('video')!.getAttribute('poster')).toBe(toR2ImageUrl(EXT));
    expect(div.querySelector('p')!.textContent).toBe('x');
  });
  it('does not touch non-image elements', () => {
    const a = document.createElement('a');
    a.setAttribute('href', EXT);
    expect(a.getAttribute('href')).toBe(EXT);
  });
});

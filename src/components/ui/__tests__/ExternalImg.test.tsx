/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { ExternalImg } from '../ExternalImg';

const RAW = 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?h=650&w=940';
const FALLBACK = '/images/fallback/texture.webp';

const fail = (c: HTMLElement) =>
  act(() => {
    c.querySelector('img')!.dispatchEvent(new Event('error'));
  });

describe('ExternalImg', () => {
  it('serves the CF-resized copy first, then raw, then the fallback', () => {
    const { container } = render(
      <ExternalImg src={RAW} cfWidth={500} fallbackSrc={FALLBACK} alt="" />,
    );
    const src = () => container.querySelector('img')!.getAttribute('src')!;

    expect(src()).toContain('img.queer.guide/cdn-cgi/image/');
    expect(src()).toContain('width=500');

    fail(container);
    expect(src()).toBe(RAW);

    fail(container);
    expect(src()).toBe(FALLBACK);

    // The fallback stage has no onError — a broken texture cannot loop.
    fail(container);
    expect(src()).toBe(FALLBACK);
  });

  it('renders the fallback directly when src is missing', () => {
    const { container } = render(
      <ExternalImg src={null} cfWidth={500} fallbackSrc={FALLBACK} alt="" />,
    );
    expect(container.querySelector('img')!.getAttribute('src')).toBe(FALLBACK);
  });

  it('resizes merchant-CDN images from their R2 copy, never the merchant host', () => {
    const shopify = 'https://cdn.shopify.com/s/files/1/2/product.webp';
    const { container } = render(
      <ExternalImg src={shopify} cfWidth={500} fallbackSrc={FALLBACK} alt="" />,
    );
    const src = container.querySelector('img')!.getAttribute('src')!;
    expect(src).toMatch(
      /^https:\/\/img\.queer\.guide\/cdn-cgi\/image\/[^/]+\/https:\/\/img\.queer\.guide\/r\//,
    );
    expect(src).not.toContain('shopify');
  });

  it('skips the CF stage for non-resizable sources', () => {
    const direct = 'https://maps.gstatic.com/tile.png';
    const { container } = render(
      <ExternalImg src={direct} cfWidth={500} fallbackSrc={FALLBACK} alt="" />,
    );
    const src = () => container.querySelector('img')!.getAttribute('src')!;

    expect(src()).toBe(direct);
    fail(container);
    expect(src()).toBe(FALLBACK);
  });
});

describe('ExternalImg without a fallback', () => {
  it('collapses (renders nothing) after the CF and raw fetches fail', () => {
    const { container } = render(<ExternalImg src={RAW} cfWidth={500} alt="" />);
    fail(container);
    fail(container);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when src is missing', () => {
    const { container } = render(<ExternalImg src={null} cfWidth={500} alt="" />);
    expect(container.querySelector('img')).toBeNull();
  });
});

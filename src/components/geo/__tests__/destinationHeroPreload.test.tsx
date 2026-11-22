import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DestinationPhoto } from '../DestinationPhoto';
import {
  cityOrCountryHeroUrl,
  destinationHeroPreload,
} from '../../../../functions/_lib/heroPreload';

/**
 * The edge preloads the destination hero (functions/_lib/heroPreload.ts). That
 * only helps if the browser then picks the SAME candidate for the <img> — so
 * the preload's imagesrcset / imagesizes must equal what DestinationPhoto
 * actually renders. Compare against the real component, not a fixture: a change
 * to either side alone would otherwise fetch every hero twice, silently.
 */
const BERLIN =
  'https://img.queer.guide/city-images/494d79ee712c0e5f15feb9c14f4b05c114906a03f6ccb739893ae2cf4cc2edb2.jpg';
const CHUECA =
  'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/public/village-images/villages/1a4bbc25.jpg';

function parsePreload(tag: string) {
  const doc = new DOMParser().parseFromString(`<head>${tag}</head>`, 'text/html');
  const link = doc.head.querySelector('link');
  if (!link) throw new Error(`no <link> in ${tag}`);
  return link;
}

function renderedImg(src: string) {
  const { container } = render(<DestinationPhoto src={src} name="Somewhere" />);
  const img = container.querySelector('img');
  if (!img) throw new Error('DestinationPhoto rendered no <img>');
  return img;
}

describe('destination hero preload', () => {
  it.each([
    ['img.queer.guide', BERLIN],
    ['Supabase storage', CHUECA],
  ])('matches the srcset and sizes DestinationPhoto renders (%s)', (_label, url) => {
    const img = renderedImg(url);
    const tag = destinationHeroPreload(url);
    expect(tag).not.toBeNull();
    const link = parsePreload(tag!);
    // Positive control: the component really emits a srcset to compare against.
    expect(img.getAttribute('srcset')).toBeTruthy();
    expect(link.getAttribute('imagesrcset')).toBe(img.getAttribute('srcset'));
    expect(link.getAttribute('imagesizes')).toBe(img.getAttribute('sizes'));
    expect(link.getAttribute('rel')).toBe('preload');
    expect(link.getAttribute('as')).toBe('image');
    expect(link.getAttribute('fetchpriority')).toBe('high');
  });

  it('emits nothing for a URL the image resizer will not take', () => {
    // No srcset on the <img> here, so a preload would guess at a single URL.
    expect(destinationHeroPreload('https://maps.gstatic.com/x.jpg')).toBeNull();
    // A merchant/publisher host is preloaded from its R2 copy.
    expect(destinationHeroPreload('https://cdn.shopify.com/s/files/x.jpg')).toContain(
      'img.queer.guide/r/',
    );
    expect(destinationHeroPreload(null)).toBeNull();
  });

  it('picks the photo the page picks: curated first, a flagged image never', () => {
    expect(
      cityOrCountryHeroUrl('city', {
        image_url: BERLIN,
        curated_image_url: CHUECA,
        image_flagged: false,
      }),
    ).toBe(CHUECA);
    expect(cityOrCountryHeroUrl('city', { image_url: BERLIN, image_flagged: true })).toBeNull();
    expect(cityOrCountryHeroUrl('country', { image_url: BERLIN })).toBe(BERLIN);
  });
});

import { describe, it, expect } from 'vitest';
import { getVenueVisual } from '../venueVisual';

describe('getVenueVisual', () => {
  it('prefers the logo, rendered contained, when one exists', () => {
    expect(
      getVenueVisual({ logo_url: 'https://logo.dev/x.png', images: ['https://photo/1.jpg'] }),
    ).toEqual({ src: 'https://logo.dev/x.png', fit: 'contain', isLogo: true });
  });

  it('falls back to the first review photo, covered, when there is no logo', () => {
    expect(getVenueVisual({ logo_url: null, images: ['https://photo/1.jpg'] })).toEqual({
      src: 'https://photo/1.jpg',
      fit: 'cover',
      isLogo: false,
    });
  });

  it('returns a null src (surface fallback) when neither exists', () => {
    expect(getVenueVisual({ logo_url: null, images: [] })).toEqual({
      src: null,
      fit: 'cover',
      isLogo: false,
    });
    expect(getVenueVisual({})).toEqual({ src: null, fit: 'cover', isLogo: false });
    expect(getVenueVisual(null)).toEqual({ src: null, fit: 'cover', isLogo: false });
  });
});

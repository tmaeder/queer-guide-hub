import { describe, it, expect } from 'vitest';
import { getVenueVisual } from '../venueVisual';

describe('getVenueVisual', () => {
  it('prefers the logo, rendered contained, when one exists', () => {
    expect(
      getVenueVisual({ logo_url: 'https://logo.dev/x.png', images: ['https://photo/1.jpg'] }),
    ).toEqual({ src: 'https://logo.dev/x.png', fit: 'contain', isLogo: true, plate: 'paper' });
  });

  it('falls back to the first review photo, covered, when there is no logo', () => {
    expect(getVenueVisual({ logo_url: null, images: ['https://photo/1.jpg'] })).toEqual({
      src: 'https://photo/1.jpg',
      fit: 'cover',
      isLogo: false,
      plate: null,
    });
  });

  it('returns a null src (surface fallback) when neither exists', () => {
    const none = { src: null, fit: 'cover', isLogo: false, plate: null };
    expect(getVenueVisual({ logo_url: null, images: [] })).toEqual(none);
    expect(getVenueVisual({})).toEqual(none);
    expect(getVenueVisual(null)).toEqual(none);
  });

  describe('plate polarity', () => {
    // The venue tile is `bg-muted`, a THEME token — light in light mode,
    // near-black in dark. Measured over 344 venue logos, 19.5% are invisible in
    // one theme or the other: 13.4% are all-dark marks that die on the dark
    // tile, 6.1% have no dark pixel and die on the light one. So the ground is
    // pinned to a literal and CHOSEN from the logo's own measured polarity.
    it('pins a measured-light logo to ink', () => {
      expect(getVenueVisual({ logo_url: 'https://x/white.png', logo_on_ink: true }).plate).toBe(
        'ink',
      );
    });

    it('pins every other logo to paper — including an unmeasured one', () => {
      // Default false is load-bearing: an undecodable logo must stay on paper,
      // because a wrong ink plate erases a dark wordmark completely.
      expect(getVenueVisual({ logo_url: 'https://x/a.png', logo_on_ink: false }).plate).toBe(
        'paper',
      );
      expect(getVenueVisual({ logo_url: 'https://x/b.png' }).plate).toBe('paper');
      expect(getVenueVisual({ logo_url: 'https://x/c.png', logo_on_ink: null }).plate).toBe(
        'paper',
      );
    });

    it('never pins a photo — it brings its own ground', () => {
      expect(
        getVenueVisual({ logo_url: null, images: ['https://p/1.jpg'], logo_on_ink: true }).plate,
      ).toBeNull();
    });
  });
});

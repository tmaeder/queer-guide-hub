/**
 * Editorial image manifest for the six footer-class public pages
 * (/about, /contact, /donate, /legal, /terms, /accessibility).
 *
 * Each entry pairs a primary remote URL (Pexels / Unsplash CDN — CSP
 * already allows `https:` for img-src) with a local fallback from the
 * existing `/public/images/fallback/` pool. If the remote URL fails,
 * `<EditorialHero>` swaps to the local fallback via onError.
 *
 * Licensing: Pexels and Unsplash both permit free hot-linking and
 * commercial use without attribution required (attribution still
 * recommended via the `credit` field, surfaced in DOM where useful).
 */

export interface EditorialImage {
  src: string;
  fallback?: string;
  alt: string;
  credit?: string;
}

export interface EditorialPageImages {
  hero: EditorialImage;
  extras?: EditorialImage[];
}

// Local fallback textures (all known to exist in /public/images/fallback/).
const LOCAL = {
  warmTexture: '/images/fallback/susan-wilkinson-l9URCYPsJPE-unsplash.webp',
  paperTexture: '/images/fallback/pawel-czerwinski-NTYYL9Eb9y8-unsplash.webp',
  softTexture: '/images/fallback/pawel-czerwinski-GT2I5UgV218-unsplash.webp',
  calmTexture: '/images/fallback/pawel-czerwinski-W_mfoOi1Elc-unsplash.webp',
  archivalTexture: '/images/fallback/maria-orlova-bU8TeXhsPcY-unsplash.webp',
  abstractDeep: '/images/fallback/pawel-czerwinski-qNe0H31x96I-unsplash.webp',
} as const;

// Pexels CDN URL helper — `?auto=compress&cs=tinysrgb&w=1920` gives
// LCP-friendly delivery. Pexels IDs are stable; if a CDN URL fails the
// local fallback chain kicks in.
const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1920`;

// Unsplash CDN URL helper.
const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?w=1920&q=80&auto=format&fit=crop`;

export const EDITORIAL_IMAGES: Record<
  'about' | 'contact' | 'donate' | 'legal' | 'terms' | 'accessibility',
  EditorialPageImages
> = {
  about: {
    hero: {
      src: pexels(1647973),
      fallback: LOCAL.warmTexture,
      alt: 'An atmospheric outdoor scene in soft, muted light',
      credit: 'Photo via Pexels',
    },
    extras: [
      {
        src: pexels(1190298),
        fallback: LOCAL.softTexture,
        alt: 'An expressive editorial photograph',
        credit: 'Photo via Pexels',
      },
      {
        src: pexels(3812944),
        fallback: LOCAL.warmTexture,
        alt: 'A quiet, candid editorial photograph',
        credit: 'Photo via Pexels',
      },
      {
        src: pexels(1181605),
        fallback: LOCAL.calmTexture,
        alt: 'A warm editorial photograph of people gathered together',
        credit: 'Photo via Pexels',
      },
    ],
  },
  contact: {
    hero: {
      src: pexels(4226140),
      fallback: LOCAL.warmTexture,
      alt: 'A warm, intimate editorial photograph',
      credit: 'Photo via Pexels',
    },
  },
  donate: {
    hero: {
      src: pexels(3692748),
      fallback: LOCAL.warmTexture,
      alt: 'A close, candid editorial photograph of two people embracing',
      credit: 'Photo via Pexels',
    },
    extras: [
      {
        src: pexels(7148384),
        fallback: LOCAL.softTexture,
        alt: 'An expressive editorial photograph of a person in mid-gesture',
        credit: 'Photo via Pexels',
      },
      {
        src: pexels(6147242),
        fallback: LOCAL.calmTexture,
        alt: 'A community scene under colourful umbrellas',
        credit: 'Photo via Pexels',
      },
      {
        src: pexels(3811082),
        fallback: LOCAL.warmTexture,
        alt: 'A documentary photograph of people working together',
        credit: 'Photo via Pexels',
      },
    ],
  },
  legal: {
    hero: {
      src: unsplash('photo-1481627834876-b7833e8f5570'),
      fallback: LOCAL.archivalTexture,
      alt: 'A calm interior with rows of books',
      credit: 'Photo via Unsplash',
    },
  },
  terms: {
    hero: {
      src: unsplash('photo-1554224155-6726b3ff858f'),
      fallback: LOCAL.paperTexture,
      alt: 'A minimal still life on a clean surface',
      credit: 'Photo via Unsplash',
    },
  },
  accessibility: {
    hero: {
      src: unsplash('photo-1517842645767-c639042777db'),
      fallback: LOCAL.calmTexture,
      alt: 'A quiet desk scene with a notebook and soft light',
      credit: 'Photo via Unsplash',
    },
  },
};

/**
 * Editorial image manifest for the six footer-class public pages
 * (/about, /contact, /donate, /legal, /terms, /accessibility).
 *
 * Heroes for the community-facing pages use authentic, CC-licensed Pride
 * and community photography from Wikimedia Commons — global and real, not
 * generic stock. Each entry pairs a primary remote URL with a local
 * fallback from `/public/images/fallback/`. If the remote URL fails,
 * `<EditorialHero>` swaps to the local fallback via onError.
 *
 * Attribution: Commons photos are CC BY / CC BY-SA. The `credit` field
 * carries the required attribution (author + licence + source) and is
 * rendered visibly by `<EditorialHero>` and the image tiles. Keep it
 * accurate when swapping images. Legal/Terms keep neutral Unsplash
 * imagery (no attribution required, but credited for consistency).
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

// Wikimedia Commons thumbnail helper. `dir` is the two hash-prefix path
// segments (e.g. '3/30'); `file` is the URL-encoded filename. CSP already
// allows `https:` for img-src, so upload.wikimedia.org loads directly.
const wm = (dir: string, file: string, w = 1280) =>
  `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/${file}/${w}px-${file}`;

// Unsplash CDN URL helper (neutral imagery for legal pages).
const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?w=1920&q=80&auto=format&fit=crop`;

export const EDITORIAL_IMAGES: Record<
  'about' | 'contact' | 'donate' | 'legal' | 'terms' | 'accessibility',
  EditorialPageImages
> = {
  about: {
    hero: {
      src: wm('3/30', 'Atlanta_Pride_2009_parade_-_large_rainbow_flag_with_crowd.jpg'),
      fallback: LOCAL.warmTexture,
      alt: 'Marchers carry a large rainbow flag over a Pride parade crowd.',
      credit: 'Atlanta Pride — Jason Riedy, CC BY 2.0, via Wikimedia Commons',
    },
    extras: [
      {
        // Venues tile
        src: wm('f/fe', 'Bangalore_Gay_Pride_Parade_%2814%29.jpg'),
        fallback: LOCAL.softTexture,
        alt: 'A bright, banner-filled Pride march through city streets.',
        credit: 'Bengaluru Pride — Nick Johnson, CC BY 2.0, via Wikimedia Commons',
      },
      {
        // unused middle slot (About renders extras[0] and extras[2])
        src: wm('b/bb', 'The_crowd_at_the_Twin_Cities_Pride_Parade_2011_%285873910083%29.jpg'),
        fallback: LOCAL.warmTexture,
        alt: 'A dense crowd lines a Pride parade route.',
        credit: 'Twin Cities Pride — Fibonacci Blue, CC BY 2.0, via Wikimedia Commons',
      },
      {
        // Community tile
        src: wm('3/3c', 'Limburg_Pride_Hasselt_Dusartplein.png'),
        fallback: LOCAL.calmTexture,
        alt: 'A festival crowd gathered in a city square under Pride flags.',
        credit: 'Limburg Pride, Hasselt — Yarneputs, CC BY-SA 4.0, via Wikimedia Commons',
      },
    ],
  },
  contact: {
    hero: {
      src: wm('9/97', 'Love%2C_Peace_%2C_brotherhood_and_Colours_._04.jpg'),
      fallback: LOCAL.warmTexture,
      alt: 'A person celebrating in rainbow Pride colours.',
      credit: 'Pride celebration — Hsukna igyat, CC BY-SA 4.0, via Wikimedia Commons',
    },
  },
  donate: {
    hero: {
      src: wm('1/1a', 'Madrid_Pride_2025_-_Demonstration_-_250705_204321.jpg'),
      fallback: LOCAL.warmTexture,
      alt: 'Two people at a Pride march, one waving a rainbow flag.',
      credit: 'Madrid Pride 2025 — Barcex, CC BY-SA 4.0, via Wikimedia Commons',
    },
    extras: [
      {
        // Verified safe spaces tile
        src: wm(
          'a/af',
          'DUBLIN_2015_LGBTQ_PRIDE_FESTIVAL_%28PREPARING_FOR_THE_PARADE%29_REF-106227_%2819029480288%29.jpg',
        ),
        fallback: LOCAL.softTexture,
        alt: 'People preparing banners and flags before a Pride parade.',
        credit: 'Dublin LGBTQ Pride — William Murphy, CC BY-SA 2.0, via Wikimedia Commons',
      },
      {
        // Free for everyone tile
        src: wm('2/2a', 'Marcha_del_orgullo_LGBTIQ%2B_en_Tacna%2C_Per%C3%BA%2C_junio_2025_12.jpg'),
        fallback: LOCAL.calmTexture,
        alt: 'Marchers carry a rainbow flag through the streets of Tacna, Peru.',
        credit:
          'Marcha del orgullo, Tacna — Silvia Margaret Bardales Quispe, CC BY-SA 4.0, via Wikimedia Commons',
      },
      {
        // Independent + global tile
        src: wm('d/df', 'Marcha_del_orgullo_LGBTIQ%2B_en_Tacna%2C_Per%C3%BA%2C_junio_2025_24.jpg'),
        fallback: LOCAL.warmTexture,
        alt: 'A Pride march fills a street in Tacna, Peru.',
        credit:
          'Marcha del orgullo, Tacna — Silvia Margaret Bardales Quispe, CC BY-SA 4.0, via Wikimedia Commons',
      },
    ],
  },
  legal: {
    hero: {
      src: unsplash('photo-1481627834876-b7833e8f5570'),
      fallback: LOCAL.archivalTexture,
      alt: 'Rows of books on library shelves.',
      credit: 'Photo via Unsplash',
    },
  },
  terms: {
    hero: {
      src: unsplash('photo-1554224155-6726b3ff858f'),
      fallback: LOCAL.paperTexture,
      alt: 'A close-up of printed text on paper.',
      credit: 'Photo via Unsplash',
    },
  },
  accessibility: {
    hero: {
      src: wm('b/bb', 'The_crowd_at_the_Twin_Cities_Pride_Parade_2011_%285873910083%29.jpg'),
      fallback: LOCAL.calmTexture,
      alt: 'A diverse crowd gathered along a Pride parade route.',
      credit: 'Twin Cities Pride — Fibonacci Blue, CC BY 2.0, via Wikimedia Commons',
    },
  },
};

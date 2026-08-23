/** Wayfinding icon set — subway-map rebrand. One stroke weight, bends not
 *  corners, one station ring per icon, round terminals. Ink on paper only:
 *  these never take track colors (color belongs to the lines). Never mix with
 *  off-system sets in the same surface — redraw in this grammar instead.
 *  Path data transcribed verbatim from the design project's Icon System. */
export const TRANSIT_ICON_PATHS = {
  search: 'M 68 44 a 24 24 0 1 0 -48 0 a 24 24 0 1 0 48 0 M 61 61 C 68 68 74 74 80 80',
  'near-you':
    'M 50 86 C 36 68 28 56 28 42 C 28 28 38 18 50 18 C 62 18 72 28 72 42 C 72 56 64 68 50 86 Z M 58 42 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0',
  route:
    'M 22 78 C 44 76 38 50 56 44 C 70 39 72 34 78 26 M 29 78 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0 M 85 26 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  saved:
    'M 50 82 C 32 66 22 54 22 42 C 22 30 31 22 41 22 C 47 22 50 26 50 32 C 50 26 53 22 59 22 C 69 22 78 30 78 42 C 78 54 68 66 50 82 Z',
  events:
    'M 20 36 C 20 28 26 24 34 24 H 66 C 74 24 80 28 80 36 V 68 C 80 76 74 80 66 80 H 34 C 26 80 20 76 20 68 Z M 36 16 C 36 20 36 24 36 28 M 64 16 C 64 20 64 24 64 28 M 57 56 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  chat: 'M 50 20 C 30 20 16 31 16 45 C 16 59 30 70 50 70 C 53 70 56 70 59 69 C 64 75 70 79 78 81 C 75 75 74 71 74 66 C 80 60 84 53 84 45 C 84 31 70 20 50 20 Z M 39 45 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0 M 53 45 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0 M 67 45 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0',
  community:
    'M 44 34 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0 M 80 34 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0 M 14 76 C 18 62 24 56 32 56 C 40 56 44 60 50 66 M 86 76 C 82 62 76 56 68 56 C 60 56 56 60 50 66',
  health:
    'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 50 32 C 52 44 52 56 50 68 M 32 50 C 44 48 56 52 68 50',
  filter: 'M 22 34 C 40 30 60 38 78 34 M 30 52 C 44 48 58 56 72 52 M 40 70 C 48 67 54 72 62 70',
  'add-station':
    'M 82 50 a 32 32 0 1 0 -64 0 a 32 32 0 1 0 64 0 M 50 36 C 50 45 50 55 50 64 M 36 50 C 45 50 55 50 64 50',
  ticket:
    'M 20 40 C 20 34 24 30 30 30 H 70 C 76 30 80 34 80 40 C 74 42 74 58 80 60 C 80 66 76 70 70 70 H 30 C 24 70 20 66 20 60 C 26 58 26 42 20 40 Z M 50 42 C 50 47 50 53 50 58',
  map: 'M 20 30 C 30 25 40 25 50 29 C 60 33 70 33 80 28 V 70 C 70 75 60 75 50 71 C 40 67 30 67 20 72 Z M 38 28 C 39 42 37 56 38 69 M 62 31 C 61 44 63 58 62 72',
  'after-dark':
    'M 62 20 C 48 26 40 38 40 52 C 40 66 48 76 62 82 C 44 84 28 70 28 51 C 28 32 44 18 62 20 Z',
  pride:
    'M 32 84 C 31 64 33 40 32 20 M 32 24 C 46 17 58 30 74 23 C 74 31 74 39 74 47 C 58 54 46 41 32 48',
  tune: 'M 22 38 C 40 34 60 42 78 38 M 22 62 C 40 58 60 66 78 62 M 47 37 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0 M 69 63 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  compass:
    'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 64 34 C 56 40 48 50 40 64 C 42 52 48 40 64 34 Z',
  'home-base':
    'M 22 50 C 32 38 42 28 50 22 C 58 28 68 38 78 50 M 30 46 C 29 57 29 68 30 78 C 43 80 57 80 70 78 C 71 68 71 57 70 46 M 57 62 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  profile:
    'M 62 32 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0 M 24 78 C 28 62 36 54 50 54 C 64 54 72 62 76 78',
  alerts:
    'M 30 64 C 30 46 34 30 50 30 C 66 30 70 46 70 64 C 74 66 76 68 78 70 C 60 74 40 74 22 70 C 24 68 26 66 30 64 Z M 44 82 C 48 85 52 85 56 82 M 50 30 C 50 26 50 24 50 21',
  helpline:
    'M 26 22 C 20 28 18 36 22 46 C 30 64 44 76 60 80 C 68 82 76 78 80 70 C 74 64 68 60 62 60 C 58 62 56 64 54 66 C 44 60 38 52 34 44 C 37 41 39 38 40 34 C 38 28 32 24 26 22 Z',
  hours:
    'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 50 32 C 50 39 50 46 50 52 C 56 54 61 57 65 61',
  library:
    'M 50 28 C 42 22 32 20 22 22 C 21 38 21 54 22 72 C 32 70 42 72 50 78 C 58 72 68 70 78 72 C 79 54 79 38 78 22 C 68 20 58 22 50 28 C 50 44 50 60 50 78',
  nightlife:
    'M 40 76 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 40 76 C 39 60 39 44 40 30 C 52 26 64 28 74 34 C 74 44 74 54 74 66 M 83 66 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0',
  meetups:
    'M 26 40 C 40 36 60 36 74 40 C 74 52 70 66 62 74 C 54 76 46 76 38 74 C 30 66 26 52 26 40 Z M 74 44 C 82 44 84 52 80 58 C 77 62 73 62 70 60 M 40 26 C 42 22 42 20 40 16 M 54 26 C 56 22 56 20 54 16',
  housing:
    'M 44 40 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0 M 43 47 C 54 57 66 68 78 78 M 64 70 C 61 74 59 77 57 80 M 74 78 C 71 81 69 83 67 85',
  documents:
    'M 28 24 C 28 42 28 60 28 78 C 42 80 56 80 72 78 C 72 64 72 50 72 36 C 66 32 60 28 54 24 C 45 23 36 23 28 24 Z M 54 24 C 54 28 54 32 54 36 C 60 36 66 36 72 36 M 40 52 C 46 50 54 54 60 52 M 40 64 C 46 62 54 66 60 64',
  share:
    'M 36 50 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 82 26 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 82 74 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0 M 35 45 C 45 40 55 36 65 31 M 35 55 C 45 60 55 64 65 69',
  'info-point':
    'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 50 46 C 50 53 50 60 50 68 M 53 32 a 3 3 0 1 0 -6 0 a 3 3 0 1 0 6 0',
  sapphic:
    'M 55 36 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 79 36 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 42 49 C 42 57 42 64 42 72 M 33 62 C 39 61 45 63 51 62 M 66 49 C 66 57 66 64 66 72 M 57 62 C 63 61 69 63 75 62',
  achillean:
    'M 59 60 a 15 15 0 1 0 -30 0 a 15 15 0 1 0 30 0 M 54 49 C 60 42 65 36 71 29 M 71 29 C 66 29 62 29 58 29 M 71 29 C 71 33 71 37 71 41 M 58 53 C 66 48 74 44 82 39 M 82 39 C 77 38 73 38 69 37 M 82 39 C 80 43 79 47 77 51',
  'trans-pride':
    'M 64 58 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0 M 60 48 C 65 42 69 37 74 31 M 74 31 C 69 31 65 31 62 31 M 74 31 C 74 35 74 39 74 43 M 40 48 C 35 42 31 37 26 31 M 28 44 C 32 40 36 36 40 32 M 50 72 C 50 76 50 80 50 85 M 42 79 C 47 78 53 78 58 79',
  rainbow:
    'M 20 72 C 20 44 33 26 50 26 C 67 26 80 44 80 72 M 36 72 C 36 54 41 42 50 42 C 59 42 64 54 64 72',
  march:
    'M 50 86 C 49 72 49 58 50 46 M 24 32 C 24 24 30 18 38 18 H 62 C 70 18 76 24 76 32 C 76 40 70 46 62 46 H 38 C 30 46 24 40 24 32 Z M 57 32 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0',
  disco:
    'M 78 48 a 28 28 0 1 0 -56 0 a 28 28 0 1 0 56 0 M 50 20 C 44 38 44 58 50 76 M 24 40 C 40 44 60 44 76 40 M 26 58 C 41 54 59 54 74 58 M 50 12 C 50 14 50 16 50 20',
  consent:
    'M 84 50 a 34 34 0 1 0 -68 0 a 34 34 0 1 0 68 0 M 36 52 C 41 56 45 60 48 64 C 53 54 59 45 66 38',
  safeword:
    'M 50 22 C 32 22 18 32 18 45 C 18 58 32 68 50 68 C 53 68 56 68 59 67 C 64 73 70 77 78 79 C 75 73 74 69 74 64 C 80 58 82 52 82 45 C 82 32 68 22 50 22 Z M 50 34 C 50 41 50 48 50 56 M 38 39 C 46 43 54 47 62 51 M 62 39 C 54 43 46 47 38 51',
  aftercare:
    'M 50 62 C 38 52 32 45 32 38 C 32 31 37 27 43 27 C 46 27 50 29 50 33 C 50 29 54 27 57 27 C 63 27 68 31 68 38 C 68 45 62 52 50 62 Z M 22 72 C 32 79 68 79 78 72',
  handcuffs:
    'M 40 48 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 86 48 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0 M 37 57 C 43 66 57 66 63 57',
  'rope-play':
    'M 74 46 a 26 26 0 1 0 -52 0 a 26 26 0 1 0 52 0 M 62 46 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0 M 64 62 C 70 68 76 74 82 80',
  collar:
    'M 22 38 C 26 60 36 70 50 70 C 64 70 74 60 78 38 M 58 76 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0',
  paddle:
    'M 50 16 C 64 16 74 26 74 40 C 74 54 64 62 50 62 C 36 62 26 54 26 40 C 26 26 36 16 50 16 Z M 50 62 C 50 70 50 76 50 84 M 56 40 a 6 6 0 1 0 -12 0 a 6 6 0 1 0 12 0',
  flogger:
    'M 50 16 C 50 26 50 36 50 44 M 44 20 C 47 19 53 19 56 20 M 50 44 C 40 56 34 68 30 82 M 50 44 C 48 58 46 70 46 84 M 50 44 C 54 58 58 70 62 82 M 50 44 C 58 54 66 64 72 74',

  // ── Venue categories (added 2026-08-10 for the map) ──────────────────────
  // The map draws a category glyph inside every pin, and those glyphs were
  // lucide — the one place in the product where two icon systems met on the
  // same surface. These ten fill the gaps the wayfinding set didn't cover.
  // Drawn to the same grammar and kept deliberately simple: they rasterize at
  // 20px into the canvas, so anything finer than this disappears.
  restaurant:
    'M 36 84 C 36 66 36 54 36 44 M 28 20 C 28 30 30 38 36 44 C 42 38 44 30 44 20 M 36 20 C 36 26 36 32 36 38 M 64 84 C 64 66 64 52 64 44 C 72 38 74 28 70 18 C 66 22 64 32 64 44',
  cafe: 'M 26 38 C 26 58 35 72 50 72 C 65 72 74 58 74 38 C 58 36 42 36 26 38 Z M 74 44 C 84 42 88 52 82 58 C 79 61 76 61 73 60 M 20 82 C 34 86 66 86 80 82',
  shop: 'M 26 38 C 42 36 58 36 74 38 C 76 54 76 66 74 80 C 58 82 42 82 26 80 C 24 66 24 54 26 38 Z M 38 38 C 38 26 43 20 50 20 C 57 20 62 26 62 38',
  gym: 'M 34 50 C 42 50 58 50 66 50 M 26 36 C 24 45 24 55 26 64 M 34 32 C 32 44 32 56 34 68 M 74 36 C 76 45 76 55 74 64 M 66 32 C 68 44 68 56 66 68',
  salon:
    'M 34 76 a 10 10 0 1 0 -20 0 a 10 10 0 1 0 20 0 M 86 76 a 10 10 0 1 0 -20 0 a 10 10 0 1 0 20 0 M 28 68 C 40 52 54 34 68 16 M 72 68 C 60 52 46 34 32 16',
  gallery:
    'M 22 26 C 40 24 60 24 78 26 C 80 44 80 60 78 76 C 60 78 40 78 22 76 C 20 60 20 44 22 26 Z M 28 68 C 36 56 42 48 50 48 C 58 48 66 58 72 68 M 66 38 a 6 6 0 1 0 -12 0 a 6 6 0 1 0 12 0',
  theater:
    'M 24 30 C 40 26 60 26 76 30 C 76 52 66 74 50 82 C 34 74 24 52 24 30 Z M 43 46 a 4 4 0 1 0 -8 0 a 4 4 0 1 0 8 0 M 65 46 a 4 4 0 1 0 -8 0 a 4 4 0 1 0 8 0 M 38 58 C 44 64 56 64 62 58',
  sauna:
    'M 22 62 C 40 58 60 58 78 62 C 78 70 78 74 78 78 C 60 80 40 80 22 78 C 22 74 22 70 22 62 Z M 34 46 C 30 38 38 32 34 22 M 50 46 C 46 38 54 32 50 22 M 66 46 C 62 38 70 32 66 22',
  // A door, not a figure: the gendered pictograms are not ours to draw, and a
  // wheelchair would claim an accessibility fact the data does not carry.
  restroom:
    'M 28 18 C 44 16 56 16 72 18 C 74 44 74 62 72 84 C 56 86 44 86 28 84 C 26 62 26 44 28 18 Z M 62 52 C 57 52 52 52 47 52 M 68 52 a 5 5 0 1 0 -10 0 a 5 5 0 1 0 10 0',
  outdoor:
    'M 50 16 C 40 30 32 42 26 52 C 34 55 42 56 50 56 C 58 56 66 55 74 52 C 68 42 60 30 50 16 Z M 50 56 C 50 68 50 78 50 86',

  // ── Marketplace departments (added 2026-08-23) ───────────────────────────
  // Category art for the M line's stop list. The department tiles used to show
  // a product photograph picked by `boutique_score`, which put a sport sock on
  // Apparel and a pair of PRIDE socks on Hygiene & Care — a product photo can
  // only ever depict ONE item, so it is the wrong kind of image for a slot that
  // has to stand for 18,000 of them. These seven fill the gaps the wayfinding
  // and venue sets left; the other four departments reuse marks that already
  // exist (`library`, `collar`, `community`, `shop` — see `departmentArt.ts`).
  //
  // Drawn to the same grammar as everything above: stroke-only, cubic, round
  // caps, nothing dead straight. They render at 44-56px inside the art plate,
  // roughly twice the map's pin size, so they carry a little more interior
  // detail than the venue glyphs — but not much: the plate also renders at
  // 28px in the department page's masthead.
  apparel:
    'M 38 24 C 32 25 26 28 20 33 C 18 39 18 45 20 51 C 24 51 28 50 32 48 C 31 59 31 71 32 82 C 44 84 56 84 68 82 C 69 71 69 59 68 48 C 72 50 76 51 80 51 C 82 45 82 39 80 33 C 74 28 68 25 62 24 C 58 30 54 33 50 33 C 46 33 42 30 38 24 Z',
  underwear:
    'M 22 34 C 41 31 59 31 78 34 M 22 34 C 23 46 26 56 31 64 C 34 69 36 74 37 80 C 41 81 45 81 48 80 C 49 70 49 62 50 56 C 51 62 51 70 52 80 C 55 81 59 81 63 80 C 64 74 66 69 69 64 C 74 56 77 46 78 34',
  swimwear:
    'M 22 33 C 41 30 59 30 78 33 C 77 45 75 57 73 69 C 66 71 59 71 52 69 C 51 63 50 57 50 51 C 50 57 49 63 48 69 C 41 71 34 71 27 69 C 25 57 23 45 22 33 Z M 43 41 C 46 44 54 44 57 41',
  jewelry:
    'M 20 26 C 30 40 40 48 50 48 C 60 48 70 40 80 26 M 50 48 C 45 53 41 59 41 65 C 41 73 45 79 50 79 C 55 79 59 73 59 65 C 59 59 55 53 50 48 Z',
  homeware:
    'M 34 45 C 38 33 42 24 50 24 C 58 24 62 33 66 45 C 55 47 45 47 34 45 Z M 50 47 C 49 57 49 67 50 75 M 36 79 C 45 77 55 77 64 79',
  selfcare:
    'M 38 45 C 37 57 37 69 38 79 C 46 81 54 81 62 79 C 63 69 63 57 62 45 C 54 43 46 43 38 45 Z M 44 45 C 44 39 45 35 46 33 C 50 32 54 32 58 33 M 46 33 C 42 31 38 28 36 24 C 40 22 44 22 48 24',
  // Two interlocking rings. Intimacy is a department of the catalogue, not a
  // depiction: the fine buckets under it (`sex_toys`, `chastity`, …) have no
  // mark that is both legible at 44px and printable on a page that is SFW by
  // default, and this tile renders BEFORE the 18+ opt-in on a visitor who has
  // asked not to see explicit imagery.
  intimacy:
    'M 56 50 a 18 18 0 1 0 -36 0 a 18 18 0 1 0 36 0 M 80 50 a 18 18 0 1 0 -36 0 a 18 18 0 1 0 36 0',
} as const;

export type TransitIconName = keyof typeof TRANSIT_ICON_PATHS;
export const TRANSIT_ICON_NAMES = Object.keys(TRANSIT_ICON_PATHS) as TransitIconName[];

/** Icon System v2 — the icon set. Format, palette and helpers live in `iconKit.ts`. */
import { C, G, M, Y, colored, ring, tinted, type IconDef } from './iconKit';

export * from './iconKit';
import { BATCH_A } from './defs/batch-a';
import { BATCH_B } from './defs/batch-b';
import { BATCH_C } from './defs/batch-c';
import { BATCH_D } from './defs/batch-d';
import { BATCH_E } from './defs/batch-e';
import { BATCH_F } from './defs/batch-f';
import { BATCH_G } from './defs/batch-g';

const DEFS = {
  // ── Wayfinding ───────────────────────────────────────────────────────────
  // A ring used as a STROKE, not a fill: the lens is a window, so filling it
  // with paper over a paper card would be invisible and filling it with the
  // track colour would put colour where the user looks through.
  search: {
    name: 'Search',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Site search and result lists.',
    l: [...colored(ring(44, 44, 24)), 'M 61 61 C 66.9 69.1 72.9 75.1 80 80'],
  },

  route: {
    name: 'Route',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Directions and routes between two places.',
    // ONE weight for the whole figure, and the rings are in it.
    //
    // The line was `colored` (ink 2.2x, colour 1.1x) while the two station
    // rings were bare strings at 1.0 — so the icon drew its own route at more
    // than twice the weight of its own stations, which is what read as "parts
    // of this are thin" beside the rest of the set. Rings cannot join a 2.2x
    // pair: at 28.6 units of stroke a radius-7 circle is a solid dot, so the
    // figure comes down to the base weight the rest of the line art uses
    // instead of the rings going up.
    //
    // Radius 9 rather than 7 for the same reason as the counter floor: a
    // stroked ring of radius r leaves `r - sw/2` of hole, so r=7 left half a
    // unit and rendered solid. 9 leaves 2.5 at 16px and 4.5 at 32px.
    l: [
      ...tinted(
        `M 22 78 C 44 76 38 50 56 44 C 70 39 72 34 78 26 ${ring(22, 78, 9)} ${ring(78, 26, 9)}`,
      ),
    ],
  },

  saved: {
    name: 'Saved',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Saved items, favourites and bookmarks.',
    f: [
      [
        'M 50 82 C 32 66 22 54 22 42 C 22 30 31 22 41 22 C 47 22 50 26 50 32 C 50 26 53 22 59 22 C 69 22 78 30 78 42 C 78 54 68 66 50 82 Z',
        'T',
      ],
    ],
  },

  chat: {
    name: 'Chat',
    group: 'Community',
    hex: C,
    t: 'none',
    use: 'Direct messages and conversations.',
    f: [
      [
        'M 50 20 C 30 20 16 31 16 45 C 16 59 30 70 50 70 C 53.2 71.5 56.2 71.5 59 69 C 64 75 70 79 78 81 C 75 75 74 71 74 66 C 80 60 84 53 84 45 C 84 31 70 20 50 20 Z',
        'T',
      ],
    ],
    // Radius 3.5, so these deliberately fill in solid and read as three ink
    // dots on the bubble. A paper counter this small is invisible — the floor
    // for a hole is radius 7 — so they are strokes, not fills.
    l: [`${ring(35.5, 45, 3.5)} ${ring(49.5, 45, 3.5)} ${ring(63.5, 45, 3.5)}`],
  },

  community: {
    name: 'Community',
    group: 'Community',
    hex: G,
    t: 'none',
    use: 'Groups, members and community spaces.',
    // Open heads. Filled discs plus crown ticks read as two eyes and a pair of
    // antennae — §7.1 bans faces on figures, and this was drawing one by
    // accident.
    l: [
      ...tinted(`${ring(32, 34, 12)} M 14 76 C 18 62 24 56 32 56 C 40 56 44 60 50 66`),
      ...tinted(`${ring(68, 34, 12)} M 86 76 C 82 62 76 56 68 56 C 60 56 56 60 50 66`),
    ],
  },

  health: {
    name: 'Health',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Sexual health services, clinics and testing.',
    // A PULSE, not a cross. v1 drew this as a circle with a plus inside it and
    // so did `add-station`, which left hue as the only thing separating them —
    // §8.7, and a violation of "colour is never the only cue" besides.
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 28 50 C 34 49 36 38 40 50 C 44 62 48 38 54 50 C 58 59 64 51 70 50'],
  },

  filter: {
    name: 'Filter',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Narrow a list down by facet.',
    l: tinted(
      'M 22 34 C 40 30 60 38 78 34 M 30 52 C 44 48 58 56 72 52 M 40 70 C 48 67 54 72 62 70',
    ),
  },

  'add-station': {
    name: 'Add station',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Add a new place, event or entry.',
    f: [[ring(50, 50, 32), 'T']],
    l: ['M 50 36 C 48.5 45 48.5 55 50 64', 'M 36 50 C 45 51.5 55 51.5 64 50'],
  },

  // One of the four v1 glyphs that used straight segments: `H 70` and `H 30`
  // are cubics now, bowed 1 unit, so the ticket keeps its silhouette.
  ticket: {
    name: 'Ticket',
    group: 'Events',
    hex: Y,
    t: 'none',
    use: 'Tickets, entry prices and door policy.',
    f: [
      [
        'M 20 40 C 20 34 24 30 30 30 C 43 29 57 29 70 30 C 76 30 80 34 80 40 C 74 42 74 58 80 60 C 80 66 76 70 70 70 C 57 71 43 71 30 70 C 24 70 20 66 20 60 C 26 58 26 42 20 40 Z',
        'T',
      ],
    ],
    l: ['M 50 42 C 51 47 51 53 50 58'],
  },

  // `V 70` on the right edge is a cubic now, bowed 1 unit outward.
  map: {
    name: 'Map',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Map views and geographic browsing.',
    f: [
      [
        'M 20 30 C 30 25 40 25 50 29 C 60 33 70 33 80 28 C 81 42 81 56 80 70 C 70 75 60 75 50 71 C 40 67 30 67 20 72 Z',
        'T',
      ],
    ],
    // NO crease at all. Two evenly spaced folds across a wavy band is an
    // accordion or a book — §8.7, and both were offered when the sheet was
    // read cold — and cutting it to one did not help: a single vertical ink
    // bar near the left edge is a SPINE, which is the book reading rather than
    // the accordion one, and beside the marker it rendered as two glyphs
    // ("I O") instead of one picture.
    //
    // The wave in the outline already says "a folded sheet"; it does not need
    // the folds drawn as well. What it needed was somewhere to BE, and the
    // station ring is the family's own word for a place.
    l: [ring(62, 48, 8)],
  },

  'after-dark': {
    name: 'After dark',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Late-night venues and after-hours listings.',
    f: [
      [
        'M 62 20 C 48 26 40 38 40 52 C 40 66 48 76 62 82 C 44 84 28 70 28 51 C 28 32 44 18 62 20 Z',
        'T',
      ],
    ],
  },

  tune: {
    name: 'Tune',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Adjust ranking, weighting and preferences.',
    f: [
      [ring(40, 37, 7), 'T'],
      [ring(62, 63, 7), 'T'],
    ],
    l: ['M 22 38 C 40 34 60 42 78 38', 'M 22 62 C 40 58 60 66 78 62'],
  },

  compass: {
    name: 'Compass',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Explore and discover what is nearby.',
    f: [
      [ring(50, 50, 34), 'T'],
      ['M 64 34 C 56 40 48 50 40 64 C 42 52 48 40 64 34 Z', 'P'],
    ],
  },

  'home-base': {
    name: 'Home base',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'The reader’s home city or saved base.',
    l: [
      ...colored('M 22 50 C 32 38 42 28 50 22 C 58 28 68 38 78 50'),
      'M 30 46 C 29 57 29 68 30 78 C 43 80 57 80 70 78 C 71 68 71 57 70 46',
      ring(50, 62, 7),
    ],
  },

  profile: {
    name: 'Profile',
    group: 'People',
    hex: C,
    t: 'none',
    use: 'A member’s profile and account.',
    // Drawn the same way as `community`, and that consistency is the point: a
    // filled head over an ink shoulder stroke puts the colour on the smallest
    // part of the figure, so at sidebar size it read as a BLACK icon sitting
    // next to a visibly green `community`. Two figure glyphs, one treatment.
    l: [...tinted(`${ring(50, 32, 12)} M 24 78 C 28 62 36 54 50 54 C 64 54 72 62 76 78`)],
  },

  alerts: {
    name: 'Alerts',
    group: 'Signals',
    hex: M,
    t: 'sides',
    use: 'Notifications, alerts and unread counts.',
    f: [
      [
        'M 30 64 C 30 46 34 30 50 30 C 66 30 70 46 70 64 C 73.1 67.2 75.1 69.2 78 70 C 60 74 40 74 22 70 C 24.9 69.2 26.9 67.2 30 64 Z',
        'T',
      ],
    ],
    l: ['M 44 82 C 48 85 52 85 56 82', 'M 50 30 C 49 26 49 24 50 21'],
  },

  helpline: {
    name: 'Helpline',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Crisis lines and support phone numbers.',
    f: [
      [
        'M 26 22 C 20 28 18 36 22 46 C 30 64 44 76 60 80 C 68 82 76 78 80 70 C 74 64 68 60 62 60 C 57.1 60.8 55.1 62.8 54 66 C 44 60 38 52 34 44 C 37 41 39 38 40 34 C 38 28 32 24 26 22 Z',
        'T',
      ],
    ],
  },

  hours: {
    name: 'Hours',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Opening hours and time windows.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 50 32 C 48.5 39 48.5 46 50 52 C 56 54 61 57 65 61'],
  },

  library: {
    name: 'Library',
    group: 'Community',
    hex: Y,
    t: 'none',
    use: 'Guides, articles and saved reading.',
    l: [
      ...colored(
        'M 50 28 C 42 22 32 20 22 22 C 21 38 21 54 22 72 C 32 70 42 72 50 78 C 58 72 68 70 78 72 C 79 54 79 38 78 22 C 68 20 58 22 50 28',
      ),
      'M 50 28 C 48.5 44 48.5 60 50 78',
    ],
  },

  nightlife: {
    name: 'Nightlife',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Bars, clubs and nightlife venues.',
    f: [
      [ring(31, 76, 9), 'T'],
      [ring(74, 66, 9), 'T'],
    ],
    l: ['M 40 76 C 39 60 39 44 40 30 C 52 26 64 28 74 34 C 72.5 44 72.5 54 74 66'],
  },

  meetups: {
    name: 'Meetups',
    group: 'Community',
    hex: G,
    t: 'none',
    use: 'Meetups, socials and casual gatherings.',
    f: [
      [
        'M 26 40 C 40 36 60 36 74 40 C 74 52 70 66 62 74 C 54 76 46 76 38 74 C 30 66 26 52 26 40 Z',
        'T',
      ],
    ],
    l: [
      'M 74 44 C 82 44 84 52 80 58 C 77 62 73 62 70 60',
      'M 40 26 C 42 22 42 20 40 16',
      'M 54 26 C 56 22 56 20 54 16',
    ],
  },

  housing: {
    name: 'Housing',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Housing, rooms and places to stay.',
    f: [[ring(30, 40, 14), 'T']],
    l: [
      'M 43 47 C 53 58.1 65 69.1 78 78',
      'M 64 70 C 59.8 73.1 57.8 76.1 57 80',
      'M 74 78 C 69.9 79.9 67.9 81.9 67 85',
    ],
  },

  documents: {
    name: 'Documents',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Documents, records and attachments.',
    f: [
      [
        'M 28 24 C 26.5 42 26.5 60 28 78 C 42 80 56 80 72 78 C 73.5 64 73.5 50 72 36 C 66.8 30.8 60.8 26.8 54 24 C 45 23 36 23 28 24 Z',
        'T',
      ],
    ],
    l: [
      'M 54 24 C 52.5 28 52.5 32 54 36 C 60 37.5 66 37.5 72 36',
      'M 40 52 C 46 50 54 54 60 52',
      'M 40 64 C 46 62 54 66 60 64',
    ],
  },

  share: {
    name: 'Share',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Share a page or send someone a link.',
    f: [
      [ring(27, 50, 9), 'T'],
      [ring(73, 26, 9), 'T'],
      [ring(73, 74, 9), 'T'],
    ],
    l: ['M 35 45 C 45.6 41.4 55.6 37.4 65 31', 'M 35 55 C 44.4 61.4 54.4 65.4 65 69'],
  },

  'info-point': {
    name: 'Info point',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Explanatory notes, help text and definitions.',
    f: [[ring(50, 50, 34), 'T']],
    // The one glyph §7.5 permits inside an icon, drawn as strokes: an "i".
    l: ['M 50 46 C 48.5 53 48.5 60 50 68', ring(50, 32, 3)],
  },

  // ── Queer ────────────────────────────────────────────────────────────────
  sapphic: {
    name: 'Sapphic',
    group: 'Queer',
    hex: M,
    t: 'none',
    use: 'Sapphic, lesbian and women-loving-women content.',
    // A VENUS SYMBOL IS ONE LINE DRAWING, not a disc with a cross beside it.
    // Filling the rings and leaving the crosses as separate ink strokes merged
    // the casing into the cross and the pair rendered as a SKULL at 80px. Ring
    // and cross are one figure at one weight, which is how v1 drew them.
    l: [
      ...tinted(`${ring(42, 36, 13)} M 42 49 C 40.5 57 40.5 64 42 72 M 33 62 C 39 61 45 63 51 62`),
      ...tinted(`${ring(66, 36, 13)} M 66 49 C 64.5 57 64.5 64 66 72 M 57 62 C 63 61 69 63 75 62`),
    ],
  },

  achillean: {
    name: 'Achillean',
    group: 'Queer',
    hex: C,
    t: 'none',
    use: 'Achillean, gay and men-loving-men content.',
    // Same rule as `sapphic`: circle and arrow are one figure.
    l: [
      ...tinted(
        `${ring(44, 60, 15)} M 54 49 C 61.1 43 66.1 37 71 29 M 71 29 C 66 27.5 62 27.5 58 29 M 71 29 C 69.5 33 69.5 37 71 41 M 58 53 C 66.8 49.3 74.8 45.3 82 39 M 82 39 C 77.2 36.5 73.2 36.5 69 37 M 82 39 C 78.6 42.4 77.6 46.4 77 51`,
      ),
    ],
  },

  'trans-pride': {
    name: 'Trans pride',
    group: 'Queer',
    // Cyan is the trans track by the colour table's own entry, so this is the
    // one icon whose hue is not a free choice.
    hex: C,
    t: 'none',
    use: 'Trans and non-binary identity and content.',
    // Same rule as `sapphic`: circle, both arrows and the cross are one figure.
    l: [
      ...tinted(
        `${ring(50, 58, 14)} M 60 48 C 66.2 43 70.2 38 74 31 M 74 31 C 69 29.5 65 29.5 62 31 M 74 31 C 72.5 35 72.5 39 74 43 M 40 48 C 36.2 41 32.2 36 26 31 M 28 44 C 33.1 41.1 37.1 37.1 40 32 M 50 72 C 48.5 76 48.5 80 50 85 M 42 79 C 47 78 53 78 58 79`,
      ),
    ],
  },

  // `H 62` and `H 38` on the banner are cubics now.
  march: {
    name: 'March',
    group: 'Queer',
    hex: M,
    // No ticks. A banner on a pole reaches y=18, and `burst` puts a mark at
    // y=2-11 directly above it — so the tick lands on the end of a vertical
    // stem and reads as an antenna, which is the horn problem TICK_WEIGHT was
    // supposed to have solved. It does not: 0.4 makes the mark thin, and a
    // thin mark on the end of a stem is still an antenna.
    t: 'none',
    use: 'Marches, protests and political action.',
    // `H 62` and `H 38` on the banner are cubics now. The station ring v1 put
    // in the middle is gone: at radius 7 it is on the floor for a paper hole,
    // so it ate the banner's centre and left a blob on a stick.
    f: [
      [
        'M 24 32 C 24 24 30 18 38 18 C 46 17 54 17 62 18 C 70 18 76 24 76 32 C 76 40 70 46 62 46 C 54 47 46 47 38 46 C 30 46 24 40 24 32 Z',
        'T',
      ],
    ],
    l: ['M 50 86 C 49 72 49 58 50 46'],
  },

  disco: {
    name: 'Disco',
    group: 'Events',
    hex: M,
    // `corners`, not `burst`: a disco ball is a round symmetric shape, and
    // burst's two upper ticks landed over the ball and read as antennae.
    t: 'corners',
    use: 'Club nights, parties and dancing.',
    f: [[ring(50, 48, 28), 'T']],
    l: [
      'M 50 20 C 44 38 44 58 50 76',
      'M 24 40 C 40 44 60 44 76 40',
      'M 26 58 C 41 54 59 54 74 58',
      'M 50 12 C 49 14 49 16 50 20',
    ],
  },

  // ── Safety ───────────────────────────────────────────────────────────────
  consent: {
    name: 'Consent',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Consent, boundaries and negotiation.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 36 52 C 39 57 43 61 48 64 C 53 54 59 45 66 38'],
  },

  safeword: {
    name: 'Safeword',
    group: 'Safety',
    hex: G,
    // Calm content: stopping a scene is not a moment that wants jaunty ticks.
    t: 'none',
    use: 'Safewords and stopping a scene.',
    f: [
      [
        'M 50 22 C 32 22 18 32 18 45 C 18 58 32 68 50 68 C 53.2 69.5 56.2 69.5 59 67 C 64 73 70 77 78 79 C 75 73 74 69 74 64 C 80 58 82 52 82 45 C 82 32 68 22 50 22 Z',
        'T',
      ],
    ],
    // Two strokes, not three. v1's vertical bar plus two diagonals made an
    // asterisk whose arms merged at this weight and read as a four-leaf clover.
    l: ['M 39 34 C 45 41.1 53 48.1 61 54', 'M 61 34 C 53 38.9 45 45.9 39 54'],
  },

  // ── Kink ─────────────────────────────────────────────────────────────────
  // §7.2 throughout this group: gear, symbols and safety — never bodies, never
  // acts.
  handcuffs: {
    name: 'Handcuffs',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Restraint gear and bondage equipment.',
    // Open cuffs, not filled discs: two solid pink circles joined by a curve
    // read as a pair of GLASSES. The hole is what makes a cuff a cuff.
    l: [...tinted(`${ring(27, 48, 13)} ${ring(73, 48, 13)} M 37 57 C 43 66 57 66 63 57`)],
  },

  'rope-play': {
    name: 'Rope play',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Rope, shibari and tie gear.',
    // ONE length of cord, doubling back at the left.
    //
    // Two drafts failed here and the second is the useful one. The SPIRAL
    // solved §8.3 (no second closed loop, so nothing to read as concentric)
    // and bought an "@": a curl that closes on itself at this weight is a
    // snail. The HANK that replaced it — a bight over two hanging strands —
    // was offered as an arch, a magnet and the letter A, because a curve
    // across the top of two uprights is an arch whatever it is made of, and
    // the wrap meant to say "rope" merged into the strands at every size.
    //
    // Laid on its side it is none of those. The bight is at the LEFT, so the
    // silhouette is a long doubled line rather than a closed-topped shape, the
    // two passes stay 16 units apart (over a 13-unit stroke at the smallest
    // size) so they never merge, and there is no closed loop anywhere for an
    // "@" to live in. It also stays clear of `intimacy` (two interlocking
    // rings) and `search` (a circle with a tail) on silhouette rather than on
    // a few units of eccentricity.
    l: [
      ...tinted(
        'M 78 56 C 64 62 52 54 50 42 C 48 30 36 22 22 26 C 14 28 14 40 22 42 C 36 38 48 46 50 58 C 52 70 64 72 78 72',
      ),
    ],
  },

  collar: {
    name: 'Collar',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Collars and ownership dynamics.',
    // CLOSED band, and the tag kept. Two things were wrong and only one of
    // them was the tag.
    //
    // §8.7: the open drooping curve with a weight hanging off it WAS
    // `jewelry` — same silhouette, same pair of parts — so the band is a
    // closed ellipse now, which is the one property a necklace does not have.
    // But dropping the tag with it left a flat ring that read as a donut, and
    // the buckle nick alone could not carry the object: it sits ON the band,
    // so it changes no silhouette. The tag does, and a closed band with a tag
    // hanging under it is not a shape `jewelry` makes.
    //
    // The band is INK and the TAG carries the colour, which is the way round
    // that survives — a coloured band over a coloured tag is one pink mass.
    // The tag is drawn first so the band crosses in front of its top, which is
    // how a tag hangs off a collar, and it sits 6 units clear of the band's
    // underside: the §3 minimum gap between two outlined shapes.
    // The band sits HIGH so the tag can be big. A ring of radius 10 under a
    // 13-unit outline shows 7 units of colour, which at 16px is a speck and
    // reads as part of the band rather than as a thing hanging off it; 12
    // shows 11, which is a tag. Moving the band up to 22-54 is what makes room
    // for that without breaking either the §3 body bound at 88 or the 6-unit
    // gap the two outlined shapes need between them.
    f: [[ring(50, 72, 12), 'T']],
    l: [
      'M 24 38 C 24 28 36 22 50 22 C 64 22 76 28 76 38 C 76 48 64 54 50 54 C 36 54 24 48 24 38 Z',
      'M 24 30 C 21 35 21 41 24 46',
    ],
  },

  paddle: {
    name: 'Paddle',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Impact play gear and spanking equipment.',
    // DIAGONAL, because the vertical version was `march` — §8.7. Both were a
    // rounded mass on a vertical stem, and squaring the blade's shoulders (the
    // previous attempt) is a detail you cannot see at 24px while the axis is
    // the first thing you can. A banner is carried upright and a paddle is
    // held in the hand, so the two now differ in the one property a silhouette
    // test actually reads.
    f: [
      [
        'M 64.8 14.8 C 72 16 80 24 83.2 33.2 C 80 44 72 54 59.2 57.2 C 52 56 44 48 40.8 38.8 C 44 28 52 18 64.8 14.8 Z',
        'T',
      ],
    ],
    l: ['M 56 56 C 48 64 38 70 28 78'],
  },

  flogger: {
    name: 'Flogger',
    group: 'Kink',
    hex: M,
    // Same antenna as `march`: the handle is a vertical stem ending at y=16
    // and `burst` marks sit just above it.
    t: 'none',
    use: 'Floggers, whips and impact toys.',
    // The falls HANG. Four strokes fanning out of one point under a dome is a
    // jellyfish — offered unprompted when the sheet was read cold — because a
    // radial fan below a rounded top is what a jellyfish is. A flogger at rest
    // has near-parallel falls with a little sway, so the spread comes down
    // from 42 units wide to 24 and the cross-stroke moves from the top of the
    // handle (where it read as a pommel) to the collar, which is the join that
    // names the object.
    l: [
      ...tinted(
        'M 44 46 C 40 58 38 70 38 84 M 48 46 C 46 58 45 72 46 84 M 52 46 C 54 58 55 72 54 84 M 56 46 C 60 58 62 70 62 84',
      ),
      'M 50 16 C 48.5 26 48.5 36 50 44',
      'M 40 44 C 46 42 54 42 60 44',
    ],
  },

  // ── Venue categories ─────────────────────────────────────────────────────
  restaurant: {
    name: 'Restaurant',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Restaurants and places to eat.',
    l: tinted(
      'M 36 84 C 37.5 66 37.5 54 36 44 M 28 20 C 28 30 30 38 36 44 C 42 38 44 30 44 20 M 36 20 C 34.5 26 34.5 32 36 38 M 64 84 C 65.5 66 65.5 52 64 44 C 72 38 74 28 70 18 C 66 22 64 32 64 44',
    ),
  },

  cafe: {
    name: 'Cafe',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Cafés, coffee bars and daytime venues.',
    f: [['M 26 38 C 26 58 35 72 50 72 C 65 72 74 58 74 38 C 58 36 42 36 26 38 Z', 'T']],
    l: ['M 74 44 C 84 42 88 52 82 58 C 79 61 76 61 73 60', 'M 20 82 C 34 86 66 86 80 82'],
  },

  shop: {
    name: 'Shop',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Shops, boutiques and retail venues.',
    f: [
      [
        'M 26 38 C 42 36 58 36 74 38 C 76 54 76 66 74 80 C 58 82 42 82 26 80 C 24 66 24 54 26 38 Z',
        'T',
      ],
    ],
    l: ['M 38 38 C 38 26 43 20 50 20 C 57 20 62 26 62 38'],
  },

  gym: {
    name: 'Gym',
    group: 'Places',
    hex: G,
    t: 'none',
    use: 'Gyms, fitness venues and sports clubs.',
    l: tinted(
      'M 34 50 C 42 51.5 58 51.5 66 50 M 26 36 C 24 45 24 55 26 64 M 34 32 C 32 44 32 56 34 68 M 74 36 C 76 45 76 55 74 64 M 66 32 C 68 44 68 56 66 68',
    ),
  },

  salon: {
    name: 'Salon',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Salons, barbers and grooming venues.',
    f: [
      [ring(24, 76, 10), 'T'],
      [ring(76, 76, 10), 'T'],
    ],
    l: ['M 28 68 C 41.2 52.9 55.2 34.9 68 16', 'M 72 68 C 61.2 51.1 47.2 33.1 32 16'],
  },

  gallery: {
    name: 'Gallery',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Galleries, museums and exhibitions.',
    f: [
      [
        'M 22 26 C 40 24 60 24 78 26 C 80 44 80 60 78 76 C 60 78 40 78 22 76 C 20 60 20 44 22 26 Z',
        'T',
      ],
    ],
    l: ['M 28 68 C 36 56 42 48 50 48 C 58 48 66 58 72 68', ring(60, 38, 6)],
  },

  theater: {
    name: 'Theater',
    group: 'Places',
    hex: Y,
    t: 'none',
    use: 'Theatres, cinemas and performance venues.',
    f: [['M 24 30 C 40 26 60 26 76 30 C 76 52 66 74 50 82 C 34 74 24 52 24 30 Z', 'T']],
    // A mask, not a face: §7.1 bans features on a FIGURE, and this is the
    // object itself. Two dots and a curve are what make it read as a mask
    // rather than a shield at 24px.
    l: [`${ring(39, 46, 4)} ${ring(61, 46, 4)}`, 'M 38 58 C 44 64 56 64 62 58'],
  },

  sauna: {
    name: 'Sauna',
    group: 'Places',
    hex: M,
    t: 'none',
    use: 'Saunas, bathhouses and cruising venues.',
    f: [
      [
        'M 22 62 C 40 58 60 58 78 62 C 76.5 70 76.5 74 78 78 C 60 80 40 80 22 78 C 23.5 74 23.5 70 22 62 Z',
        'T',
      ],
    ],
    l: [
      'M 34 46 C 30 38 38 32 34 22',
      'M 50 46 C 46 38 54 32 50 22',
      'M 66 46 C 62 38 70 32 66 22',
    ],
  },

  // A door, not a figure: the gendered pictograms are not ours to draw, and a
  // wheelchair would claim an accessibility fact the data does not carry.
  restroom: {
    name: 'Restroom',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Public toilets and restrooms.',
    f: [
      [
        'M 28 18 C 44 16 56 16 72 18 C 74 44 74 62 72 84 C 56 86 44 86 28 84 C 26 62 26 44 28 18 Z',
        'T',
      ],
    ],
    l: ['M 62 52 C 57 50.5 52 50.5 47 52', ring(63, 52, 5)],
  },

  outdoor: {
    name: 'Outdoor',
    group: 'Places',
    hex: G,
    t: 'none',
    use: 'Parks, beaches and outdoor spaces.',
    f: [
      [
        'M 50 16 C 38.8 29.2 30.8 41.2 26 52 C 34 55 42 56 50 56 C 58 56 66 55 74 52 C 69.2 41.2 61.2 29.2 50 16 Z',
        'T',
      ],
    ],
    l: ['M 50 56 C 48.5 68 48.5 78 50 86'],
  },

  // ── Marketplace departments ──────────────────────────────────────────────
  apparel: {
    name: 'Apparel',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Clothing and apparel listings.',
    f: [
      [
        'M 38 24 C 32 25 26 28 20 33 C 18 39 18 45 20 51 C 24.4 52.5 28.4 51.5 32 48 C 31 59 31 71 32 82 C 44 84 56 84 68 82 C 69 71 69 59 68 48 C 71.6 51.5 75.6 52.5 80 51 C 82 45 82 39 80 33 C 74 28 68 25 62 24 C 58 30 54 33 50 33 C 46 33 42 30 38 24 Z',
        'T',
      ],
    ],
  },

  underwear: {
    name: 'Underwear',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Underwear, jockstraps and base layers.',
    l: tinted(
      'M 22 34 C 41 31 59 31 78 34 M 22 34 C 23 46 26 56 31 64 C 34 69 36 74 37 80 C 41 81 45 81 48 80 C 50.5 70.1 50.5 62.1 50 56 C 49.5 62.1 49.5 70.1 52 80 C 55 81 59 81 63 80 C 64 74 66 69 69 64 C 74 56 77 46 78 34',
    ),
  },

  swimwear: {
    name: 'Swimwear',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Swimwear, trunks and beachwear.',
    f: [
      [
        'M 22 33 C 41 30 59 30 78 33 C 75.5 44.8 73.5 56.8 73 69 C 66 71 59 71 52 69 C 52.5 62.8 51.5 56.8 50 51 C 48.5 56.8 47.5 62.8 48 69 C 41 71 34 71 27 69 C 26.5 56.8 24.5 44.8 22 33 Z',
        'T',
      ],
    ],
    l: ['M 43 41 C 46 44 54 44 57 41'],
  },

  jewelry: {
    name: 'Jewelry',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Jewellery, rings and accessories.',
    f: [
      [
        'M 50 48 C 45 53 41 59 41 65 C 41 73 45 79 50 79 C 55 79 59 73 59 65 C 59 59 55 53 50 48 Z',
        'T',
      ],
    ],
    l: ['M 20 26 C 30 40 40 48 50 48 C 60 48 70 40 80 26'],
  },

  homeware: {
    name: 'Homeware',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Home goods, decor and houseware.',
    f: [['M 34 45 C 38 33 42 24 50 24 C 58 24 62 33 66 45 C 55 47 45 47 34 45 Z', 'T']],
    l: ['M 50 47 C 49 57 49 67 50 75', 'M 36 79 C 45 77 55 77 64 79'],
  },

  selfcare: {
    name: 'Selfcare',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Grooming, skincare and self-care products.',
    f: [
      [
        'M 38 45 C 37 57 37 69 38 79 C 46 81 54 81 62 79 C 63 69 63 57 62 45 C 54 43 46 43 38 45 Z',
        'T',
      ],
    ],
    l: [
      'M 44 45 C 47 39 46 35 46 33 C 50 32 54 32 58 33',
      'M 46 33 C 42 31 38 28 36 24 C 40 22 44 22 48 24',
    ],
  },

  // ── Marketplace categories ───────────────────────────────────────────────
  // One mark per group (and per fine bucket where the group mark would name
  // the wrong thing), so a tile titled Footwear shows a shoe rather than its
  // department's T-shirt. Same rules as the department glyphs above: Market
  // group, no ticks, one track colour chosen to match the department.
  // The kink entries show gear only, never bodies or acts (rule 6).
  trousers: {
    name: 'Trousers',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Trousers, jeans, shorts and other bottoms.',
    f: [
      [
        'M 30 16 C 43.3 17.6 56.7 17.6 70 16 C 70.4 38.8 72.4 61.5 76 84 C 69.7 82.4 63.3 82.4 57 84 C 56.2 69.1 53.9 54.4 50 40 C 46.1 54.4 43.8 69.1 43 84 C 36.7 82.4 30.3 82.4 24 84 C 27.6 61.5 29.6 38.8 30 16 Z',
        'T',
      ],
    ],
    l: ['M 30 26 C 43.3 27.6 56.7 27.6 70 26'],
  },

  shorts: {
    name: 'Shorts',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Shorts and cut-offs.',
    f: [
      [
        'M 26 26 C 42 27.6 58 27.6 74 26 C 74.4 40.9 76.4 55.5 80 70 C 72.2 69.1 64.5 69.7 57 72 C 56.2 62.9 53.9 54.3 50 46 C 46.1 54.3 43.8 62.9 43 72 C 35.5 69.7 27.8 69.1 20 70 C 23.6 55.5 25.6 40.9 26 26 Z',
        'T',
      ],
    ],
    l: ['M 26 36 C 42 37.6 58 37.6 74 36'],
  },

  skirt: {
    name: 'Skirt',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Skirts and dresses.',
    f: [
      [
        'M 36 20 C 45.3 21.6 54.7 21.6 64 20 C 63.8 23.9 65.2 27.3 68 30 C 71.1 47.1 75.8 63.8 82 80 C 60.7 78.4 39.3 78.4 18 80 C 24.2 63.8 28.9 47.1 32 30 C 34.8 27.3 36.2 23.9 36 20 Z',
        'T',
      ],
    ],
    l: [
      'M 32 30 C 44 31.6 56 31.6 68 30',
      'M 42 40 C 38.4 51.7 36.4 63.7 36 76',
      'M 58 40 C 58.4 52.3 60.4 64.3 64 76',
    ],
  },

  hoodie: {
    name: 'Hoodie',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Hoodies, jackets, coats and knitwear.',
    f: [
      [
        'M 34 26 C 44.7 27.6 55.3 27.6 66 26 C 69.9 30.1 74.5 32.7 80 34 C 80.4 47.6 82.4 60.9 86 74 C 81.7 73.1 77.7 73.8 74 76 C 74.3 66.4 72.9 57.1 70 48 C 68.4 60.7 68.4 73.3 70 86 C 56.7 84.4 43.3 84.4 30 86 C 31.6 73.3 31.6 60.7 30 48 C 27.1 57.1 25.7 66.4 26 76 C 22.3 73.8 18.3 73.1 14 74 C 17.6 60.9 19.6 47.6 20 34 C 25.5 32.7 30.1 30.1 34 26 Z',
        'T',
      ],
    ],
    l: ['M 38 27 C 38 18 44 14 50 14 C 56 14 62 18 62 27', 'M 50 30 C 48.4 48.7 48.4 67.3 50 86'],
  },

  bodysuit: {
    name: 'Bodysuit',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Bodysuits, singlets and harness-cut bodywear.',
    f: [
      [
        'M 36 14 C 38 22 42 26 50 26 C 58 26 62 22 64 14 C 68 19 71 25 70 32 C 71 44 70 56 67 66 C 62 72 58 78 56 86 C 52 87 48 87 44 86 C 42 78 38 72 33 66 C 30 56 29 44 30 32 C 29 25 32 19 36 14 Z',
        'T',
      ],
    ],
    l: ['M 33 66 C 40 64 46 66 50 72 C 54 66 60 64 67 66'],
  },

  shoe: {
    name: 'Shoe',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Shoes, boots and other footwear.',
    f: [
      [
        'M 14 74 C 15.6 62.7 15.6 51.3 14 40 C 19.3 41.6 24.7 41.6 30 40 C 32 46.2 35.3 51.5 40 56 C 48.4 58.9 57.1 60.2 66 60 C 70.8 63.5 76.1 65.5 82 66 C 81.8 69.9 83.2 73.3 86 76 C 83.8 77.5 83.1 79.5 84 82 C 61.3 80.4 38.7 80.4 16 82 C 16.9 78.9 16.2 76.3 14 74 Z',
        'T',
      ],
    ],
    l: [
      'M 14 72 C 38 73.6 62 73.6 86 72',
      'M 38 46 C 41.1 46.9 43.7 46.2 46 44',
      'M 44 54 C 47.1 54.9 49.7 54.2 52 52',
    ],
  },

  cap: {
    name: 'Cap',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Caps, hats and other headwear.',
    f: [
      ['M 20 62 C 20 40 32 28 48 28 C 64 28 74 40 74 58 C 56 62 38 63 20 62 Z', 'T'],
      ['M 70 58 C 78 58 84 61 88 66 C 80 69 70 68 62 64 C 64 61 66 59 70 58 Z', 'T'],
    ],
    l: ['M 47 28 C 44 38 42 50 42 62'],
  },

  sock: {
    name: 'Sock',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Socks and hosiery.',
    f: [
      [
        'M 36 14 C 44.7 15.6 53.3 15.6 62 14 C 60.4 26.7 60.4 39.3 62 52 C 67.2 56.7 73.2 60.1 80 62 C 80.6 66.7 82.6 70.7 86 74 C 82 77.1 79.3 81.1 78 86 C 69.7 82.4 61 80.4 52 80 C 48.3 75.4 43.6 72 38 70 C 38.9 64.5 38.3 59.1 36 54 C 37.6 40.7 37.6 27.3 36 14 Z',
        'T',
      ],
    ],
    l: ['M 36 26 C 44.7 27.6 53.3 27.6 62 26'],
  },

  tote: {
    name: 'Tote bag',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Bags, totes and carried accessories.',
    f: [
      [
        'M 22 42 C 40.7 43.6 59.3 43.6 78 42 C 75.1 56.5 73.7 71.2 74 86 C 58 84.4 42 84.4 26 86 C 26.3 71.2 24.9 56.5 22 42 Z',
        'T',
      ],
    ],
    l: ['M 38 42 C 38 24 62 24 62 42'],
  },

  hanger: {
    name: 'Hanger',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'General clothing that fits no narrower category.',
    l: [
      ['M 50 36 C 50 28 58 27 58 20 C 58 15 54 13 50 13 C 46 13 43 15 42 19', null, 1],
      [
        'M 50 36 C 36 43 24 50 16 60 C 13 63 14 68 19 68 C 40 67 60 67 81 68 C 86 68 87 63 84 60 C 76 50 64 43 50 36 Z',
        null,
        1,
      ],
      [
        'M 50 36 C 36 43 24 50 16 60 C 13 63 14 68 19 68 C 40 67 60 67 81 68 C 86 68 87 63 84 60 C 76 50 64 43 50 36 Z',
        'T',
        0.45,
      ],
    ],
  },

  belt: {
    name: 'Belt',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Belts and buckles.',
    f: [
      [
        'M 12 42 C 37.3 43.6 62.7 43.6 88 42 C 86.4 47.3 86.4 52.7 88 58 C 62.7 56.4 37.3 56.4 12 58 C 13.6 52.7 13.6 47.3 12 42 Z',
        'T',
      ],
      [
        'M 34 32 C 41.3 33.6 48.7 33.6 56 32 C 54.4 44 54.4 56 56 68 C 48.7 66.4 41.3 66.4 34 68 C 35.6 56 35.6 44 34 32 Z',
        'P',
      ],
    ],
    l: ['M 40 50 C 48 51.6 56 51.6 64 50'],
  },

  sunglasses: {
    name: 'Sunglasses',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Sunglasses and eyewear.',
    f: [
      ['M 16 42 C 26 40 36 40 44 43 C 44 56 38 64 29 64 C 20 64 16 56 16 42 Z', 'T'],
      ['M 84 42 C 74 40 64 40 56 43 C 56 56 62 64 71 64 C 80 64 84 56 84 42 Z', 'T'],
    ],
    l: [
      'M 44 46 C 47 42 53 42 56 46',
      'M 16 42 C 16 37 15 34 12 32',
      'M 84 42 C 84 37 85 34 88 32',
    ],
  },

  key: {
    name: 'Key',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Keychains, keyrings and small charms.',
    f: [
      ['M 51 36 a 19 19 0 1 0 -38 0 a 19 19 0 1 0 38 0', 'T'],
      ['M 41 36 a 9 9 0 1 0 -18 0 a 9 9 0 1 0 18 0', 'P'],
    ],
    l: [
      ['M 46 49 C 58 55 70 63 84 74', null, 1.6],
      ['M 68 62 C 70 66 69 70 65 74', null, 1],
      ['M 78 69 C 80 73 79 77 75 81', null, 1],
    ],
  },

  mitten: {
    name: 'Mitten',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Gloves, mittens and scarves.',
    f: [
      [
        'M 32 86 C 29 72 28 58 30 44 C 30 28 38 18 50 18 C 62 18 68 28 68 42 C 70 48 70 54 68 58 C 72 52 78 48 82 52 C 86 56 82 64 78 70 C 74 76 70 80 68 86 C 56 88 44 88 32 86 Z',
        'T',
      ],
    ],
    l: ['M 31 74 C 44 76 56 76 69 74'],
  },

  wig: {
    name: 'Wig',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Wigs and hairpieces.',
    f: [
      [
        'M 50 14 C 30 14 18 28 18 48 C 18 58 20 66 24 72 C 34 74 66 74 76 72 C 80 66 82 58 82 48 C 82 28 70 14 50 14 Z',
        'T',
      ],
      [
        'M 36 44 C 44 40 54 36 60 30 C 63 38 64 46 64 54 C 64 64 58 70 50 70 C 42 70 36 64 36 54 C 34 50 34 47 36 44 Z',
        'P',
      ],
    ],
    l: ['M 50 72 C 51 76 51 80 50 84', 'M 38 86 C 46 84 54 84 62 86'],
  },

  jockstrap: {
    name: 'Jockstrap',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Jockstraps and athletic supporters.',
    f: [
      [
        'M 16 26 C 38.7 27.6 61.3 27.6 84 26 C 82.4 29.3 82.4 32.7 84 36 C 61.3 34.4 38.7 34.4 16 36 C 17.6 32.7 17.6 29.3 16 26 Z',
        'T',
      ],
      ['M 38 36 C 40 52 44 64 50 72 C 56 64 60 52 62 36 C 54 38 46 38 38 36 Z', 'T'],
    ],
    l: [
      ['M 17 36 C 22 54 32 68 46 74', null, 1],
      ['M 83 36 C 78 54 68 68 54 74', null, 1],
    ],
  },

  thong: {
    name: 'Thong',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Thongs, G-strings and minimal briefs.',
    f: [['M 30 36 C 43 39 57 39 70 36 C 62 48 56 60 50 74 C 44 60 38 48 30 36 Z', 'T']],
    l: ['M 13 28 C 19 32 24 34 30 36', 'M 70 36 C 76 34 81 32 87 28'],
  },

  bra: {
    name: 'Bra',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Bras, bralettes and lingerie.',
    f: [
      ['M 16 64 C 16 48 24 38 34 38 C 43 38 48 48 50 60 C 40 65 28 66 16 64 Z', 'T'],
      ['M 84 64 C 84 48 76 38 66 38 C 57 38 52 48 50 60 C 60 65 72 66 84 64 Z', 'T'],
    ],
    l: ['M 28 40 C 28 30 29 22 31 15', 'M 72 40 C 72 30 71 22 69 15'],
  },

  film: {
    name: 'Film',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Films, DVDs and video.',
    f: [
      [
        'M 18 44 C 39.3 45.6 60.7 45.6 82 44 C 80.4 57.3 80.4 70.7 82 84 C 60.7 82.4 39.3 82.4 18 84 C 19.6 70.7 19.6 57.3 18 44 Z',
        'T',
      ],
      [
        'M 18 40 C 38.5 35.5 58.5 29.5 78 22 C 77.8 26.5 79.1 30.5 82 34 C 61.5 38.5 41.5 44.5 22 52 C 22.2 47.5 20.9 43.5 18 40 Z',
        'P',
      ],
    ],
    l: ['M 36 35 C 36.6 39.4 38.6 43.1 42 46', 'M 56 29 C 56.6 33.4 58.6 37.1 62 40'],
  },

  'gem-ring': {
    name: 'Gem ring',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Rings and bands.',
    f: [
      ['M 74 60 a 24 24 0 1 0 -48 0 a 24 24 0 1 0 48 0', 'T'],
      ['M 64 60 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0', 'P'],
      ['M 50 14 C 56 20 60 26 62 32 C 56 37 44 37 38 32 C 40 26 44 20 50 14 Z', 'T'],
    ],
  },

  perfume: {
    name: 'Perfume',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Fragrance, cologne and perfume.',
    f: [
      [
        'M 28 50 C 28 42 36 38 50 38 C 64 38 72 42 72 50 C 72 62 72 74 70 86 C 56 88 44 88 30 86 C 28 74 28 62 28 50 Z',
        'T',
      ],
      ['M 42 38 C 41 34 41 30 43 26 C 48 24 52 24 57 26 C 59 30 59 34 58 38 Z', 'P'],
    ],
    l: ['M 64 24 C 70 20 76 18 82 18', 'M 64 30 C 70 30 76 32 82 34'],
  },

  soap: {
    name: 'Soap',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Soap, bath and body wash.',
    f: [
      [
        'M 16 58 C 16 50 22 46 30 46 C 50 44 66 44 74 46 C 82 48 84 52 84 58 C 84 68 84 74 80 80 C 60 84 40 84 22 80 C 17 74 16 66 16 58 Z',
        'T',
      ],
      ['M 44 28 a 10 10 0 1 0 -20 0 a 10 10 0 1 0 20 0', 'P'],
      ['M 70 22 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0', 'P'],
    ],
  },

  candle: {
    name: 'Candle',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Candles, massage oils and edible body products.',
    f: [
      [
        'M 34 42 C 44 40 56 40 66 42 C 67 56 67 72 66 86 C 56 88 44 88 34 86 C 33 72 33 56 34 42 Z',
        'T',
      ],
      ['M 50 12 C 57 20 60 26 58 31 C 56 36 44 36 42 31 C 40 26 43 20 50 12 Z', 'T'],
    ],
    l: ['M 50 36 C 51.5 37.5 51.5 39 50 41'],
  },

  capsule: {
    name: 'Capsule',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Supplements, capsules and libido products.',
    f: [
      [
        'M 50 34 C 42 33 36 33 30 34 C 21 34 14 41 14 50 C 14 59 21 66 30 66 C 36 67 42 67 50 66 C 51 56 51 44 50 34 Z',
        'T',
      ],
      [
        'M 50 34 C 58 33 64 33 70 34 C 79 34 86 41 86 50 C 86 59 79 66 70 66 C 64 67 58 67 50 66 C 49 56 49 44 50 34 Z',
        'P',
      ],
    ],
  },

  kegel: {
    name: 'Kegel balls',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Kegel balls, weighted trainers and ben wa balls.',
    f: [
      ['M 52 34 a 16 16 0 1 0 -32 0 a 16 16 0 1 0 32 0', 'T'],
      ['M 76 62 a 16 16 0 1 0 -32 0 a 16 16 0 1 0 32 0', 'T'],
    ],
    l: ['M 70 75 C 74 78 77 82 78 88'],
  },

  clamps: {
    name: 'Clamps',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Nipple clamps, suckers and weights.',
    f: [
      [
        'M 18 18 C 24 16 30 16 36 18 C 35 26 33 34 30 40 C 28 41 26 41 24 40 C 21 34 19 26 18 18 Z',
        'T',
      ],
      [
        'M 64 18 C 70 16 76 16 82 18 C 81 26 79 34 76 40 C 74 41 72 41 70 40 C 67 34 65 26 64 18 Z',
        'T',
      ],
    ],
    l: [
      'M 27 41 C 32 70 68 70 73 41',
      'M 22 26 C 26 27 30 27 33 26',
      'M 67 26 C 71 27 75 27 78 26',
    ],
  },

  bolt: {
    name: 'Bolt',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Electro-stimulation units and pads.',
    f: [
      [
        'M 58 12 C 46.7 25.1 36.7 39.1 28 54 C 34.7 55.6 41.3 55.6 48 54 C 43.8 65 41.1 76.3 40 88 C 52 73.6 62.6 58.2 72 42 C 65.3 40.4 58.7 40.4 52 42 C 55.6 32.3 57.6 22.3 58 12 Z',
        'T',
      ],
    ],
  },

  beads: {
    name: 'Beads',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Anal beads and graduated bead toys.',
    f: [
      ['M 40 30 a 10 10 0 1 0 -20 0 a 10 10 0 1 0 20 0', 'T'],
      ['M 60 48 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0', 'T'],
      ['M 82 68 a 14 14 0 1 0 -28 0 a 14 14 0 1 0 28 0', 'T'],
    ],
    l: ['M 21 21 C 19 17 17 15 14 13'],
  },

  // Two interlocking rings. Intimacy is a department of the catalogue, not a
  // depiction: the fine buckets under it (`sex_toys`, `chastity`, …) have no
  // mark that is both legible at 44px and printable on a page that is SFW by
  // default, and this tile renders BEFORE the 18+ opt-in.
  intimacy: {
    name: 'Intimacy',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Intimacy and adult product departments.',
    f: [
      [ring(38, 50, 18), 'T'],
      [ring(62, 50, 18), 'T'],
    ],
  },

  // The pin is a genuine enclosed mass, so it fills; the hole in it is paper
  // at radius 8, comfortably over the radius-5 floor where counters fill in.
  'near-you': {
    name: 'Near you',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Results sorted by distance from the reader.',
    f: [
      [
        'M 50 86 C 36 68 28 56 28 42 C 28 28 38 18 50 18 C 62 18 72 28 72 42 C 72 56 64 68 50 86 Z',
        'T',
      ],
      [ring(50, 42, 8), 'P'],
    ],
  },

  // ── Events ───────────────────────────────────────────────────────────────
  // One of the four v1 glyphs that used straight segments. `H 66`, `V 68` and
  // `H 34` are now cubics whose control points sit 1 unit off the chord, so the
  // silhouette is the same calendar and nothing in it is dead straight. The two
  // hangers needed the same treatment for the same reason — `M 36 16 C 36 20 36
  // 24 36 28` holds x at 36 throughout, which is a straight line written as a
  // cubic and still breaks the rule.
  events: {
    name: 'Events',
    group: 'Events',
    hex: Y,
    // `sides`, not `crown`, and the reason generalises: a tick set may not
    // collide with the icon's OWN projections. The calendar's two hangers
    // already stand up out of the body, and crown's three ticks land directly
    // above them — the glyph stopped reading as a calendar and started reading
    // as a robot with antennae. Ticks are motion, not more drawing.
    t: 'none',
    use: 'Event listings, calendars and date pickers.',
    f: [
      [
        'M 20 36 C 20 28 26 24 34 24 C 45 23 55 23 66 24 C 74 24 80 28 80 36 C 81 47 81 57 80 68 C 80 76 74 80 66 80 C 55 81 45 81 34 80 C 26 80 20 76 20 68 Z',
        'T',
      ],
      [ring(50, 56, 8), 'P'],
    ],
    l: ['M 36 16 C 35 20 35 24 36 28', 'M 64 16 C 65 20 65 24 64 28'],
  },

  // ── Queer ────────────────────────────────────────────────────────────────
  // THE ONLY MULTI-TRACK ICON. The four bands are the four tracks, which is the
  // one place in the product where they appear together outside
  // `.intersection-gradient`. Written as literal colours rather than "T"
  // because the icon has no single track colour; `hex` records the first band
  // so the field is never meaningless. Nothing else may do this and the spec
  // test asserts it.
  //
  // IT HAS NO MAST, AND THAT IS ARITHMETIC RATHER THAN TASTE. A band needs ~16
  // units of pitch to survive its own ink outline (see MIN_FILL_PITCH in the
  // spec test), so four bands need 64 of the 76 units the body box allows.
  // Drawn as a flag on a pole, the mast then has nowhere below the flag to go:
  // the first attempt put four 9-unit bands on a pole and rendered a SOLID
  // BLACK BLOB at every size, because each band's interior was 9 - 10.4 units,
  // i.e. negative. Filling the box with the flag itself is what buys the pitch.
  pride: {
    name: 'Pride',
    group: 'Queer',
    hex: M,
    // No ticks. The flag's top edge runs straight under the `burst` marks, so
    // the two vertical ones read as a pair of aerials standing on it — the
    // flag is the one shape in the set wide enough for that to look deliberate
    // and therefore wrong rather than merely noisy.
    t: 'none',
    use: 'Pride events, queer identity and the brand mark.',
    // ONE keyline around the whole flag, four bands of pure colour inside it.
    //
    // Four separately outlined bands is MIN_FILL_PITCH read the wrong way
    // round: the flag is 60 units tall, so a band is 15 and the outline is up
    // to 13 of them, which left two units of colour between two ink rules —
    // and because neighbouring bands each drew their own, every boundary came
    // out double. Four bands, seven ink rules, almost no colour. That is the
    // "muddy scribble".
    //
    // The silhouette is drawn FIRST so the bands paint over the inner half of
    // its stroke; what survives is a ~6.5-unit casing on the outside, which is
    // a keyline rather than a scribble. The 1-unit sliver of M visible past the
    // bands on the right sits under that casing.
    f: [
      ['M 14 20 C 38 13 62 27 86 19 C 87.5 39 87.5 60 86 80 C 62 87 38 73 14 80 Z', M],
      ['M 14 20 C 38 13 62 27 86 19 C 84.5 24 84.5 29 86 34 C 62 42 38 28 14 35 Z', M, 0],
      ['M 14 35 C 38 28 62 42 86 34 C 84.5 39 84.5 44 86 49 C 62 57 38 43 14 50 Z', C, 0],
      ['M 14 50 C 38 43 62 57 86 49 C 84.5 54 84.5 59 86 64 C 62 72 38 58 14 65 Z', G, 0],
      ['M 14 65 C 38 58 62 72 86 64 C 84.5 69 84.5 74 86 79 C 62 87 38 73 14 80 Z', Y, 0],
    ],
  },

  // The app icon. `public/favicon.svg` carries this geometry verbatim and
  // `brandAssetSync.test.ts` pins the two together, so the two arcs are stored
  // as ONE path string: the derived ink path below has to come back out
  // byte-identical or the favicon silently drifts from the icon set.
  rainbow: {
    name: 'Rainbow',
    group: 'Queer',
    hex: M,
    t: 'crown',
    use: 'Queer culture generally; the app icon.',
    l: [
      [
        'M 20 72 C 20 44 33 26 50 26 C 67 26 80 44 80 72 M 36 72 C 36 54 41 42 50 42 C 59 42 64 54 64 72',
        null,
        2.2,
      ],
      [
        'M 20 72 C 20 44 33 26 50 26 C 67 26 80 44 80 72 M 36 72 C 36 54 41 42 50 42 C 59 42 64 54 64 72',
        'T',
        1.1,
      ],
    ],
  },

  // ── Safety ───────────────────────────────────────────────────────────────
  // `t: 'none'`, and that is a rule rather than a preference: §5 reserves the
  // empty tick set for calm and sensitive content, and aftercare is the most
  // sensitive thing in the Kink/Safety groups. Ticks would make it jaunty.
  aftercare: {
    name: 'Aftercare',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Aftercare guidance and post-scene support.',
    f: [
      [
        'M 50 62 C 38 52 32 45 32 38 C 32 31 37 27 43 27 C 46 27 50 29 50 33 C 50 29 54 27 57 27 C 63 27 68 31 68 38 C 68 45 62 52 50 62 Z',
        'T',
      ],
    ],
    l: ['M 22 72 C 32 79 68 79 78 72'],
  },

  // ── Intimacy gear and toys (ported from v1, 2026-10-10 wave) ─────────────
  // §7.2 governs every mark here: gear, symbols and safety — never bodies,
  // never acts. Each one is a line drawing with a station ring, so each takes
  // its colour from the base-weight tint rather than a fill; widening them to
  // the 2.2x strap closes every one of these station rings solid.
  'toy-dildo': {
    name: 'Dildo',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Dildos and insertable toys.',
    // FILLED, and the ring is gone. An open U with a separate ring below it is
    // a padlock — shackle over body — which is what the sheet offered, and the
    // ring was the body. Drawn as one closed mass with a flared base it is an
    // object with a base, which is what it is; a padlock's shackle cannot be
    // solid.
    f: [
      [
        'M 38 62 C 36.5 50 36.5 38 38 30 C 39 21 43 16 50 16 C 57 16 61 21 62 30 C 63.5 38 63.5 50 62 62 C 68 66 72 70 74 76 C 66 80 34 80 26 76 C 28 70 32 66 38 62 Z',
        'T',
      ],
    ],
  },

  'toy-plug': {
    name: 'Plug',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Plugs and anal toys.',
    f: [
      [
        'M 50 18 C 44 26 40 35 40 44 C 40 52 44 57 50 57 C 56 57 60 52 60 44 C 60 35 56 26 50 18 Z',
        'T',
      ],
    ],
    l: ['M 50 57 C 49 62 49 66 50 69', 'M 32 80 C 44 75 56 75 68 80', ring(50, 69, 6)],
  },

  'toy-stroker': {
    name: 'Stroker',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Strokers and masturbation sleeves.',
    f: [
      [
        'M 32 28 C 44 25 56 25 68 28 C 70 44 70 60 68 76 C 56 79 44 79 32 76 C 30 60 30 44 32 28 Z',
        'T',
      ],
    ],
    l: ['M 32 28 C 44 33 56 33 68 28', ring(50, 52, 7)],
  },

  'toy-vibrator': {
    name: 'Vibrator',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Vibrators and powered toys.',
    f: [
      [
        'M 42 72 C 41 58 41 40 42 30 C 43 22 46 18 50 18 C 54 18 57 22 58 30 C 59 40 59 58 58 72 C 54 76 46 76 42 72 Z',
        'T',
      ],
    ],
    l: ['M 24 32 C 16 42 16 58 24 68', 'M 76 32 C 84 42 84 58 76 68', ring(50, 50, 6)],
  },

  'toy-cockring': {
    name: 'Cockring',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Cockrings and constriction toys.',
    f: [
      [
        'M 50 76 C 33 76 22 65 22 50 C 22 35 33 24 50 24 C 67 24 78 35 78 50 C 78 65 67 76 50 76 Z',
        'T',
      ],
      [ring(50, 50, 8), 'P'],
    ],
  },

  'toy-chastity': {
    name: 'Chastity',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Chastity cages and devices.',
    l: [
      ...tinted(
        `M 36 30 C 34 44 34 58 38 70 C 44 76 56 76 62 70 C 66 58 66 44 64 30 M 36 40 C 45 37 55 37 64 40 M 36 52 C 45 49 55 49 64 52 M 37 63 C 45 60 55 60 63 63 ${ring(50, 26, 8)}`,
      ),
    ],
  },

  'toy-pump': {
    name: 'Pump',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Pumps and suction toys.',
    f: [
      [
        'M 36 34 C 35 48 35 62 36 74 C 44 78 56 78 64 74 C 65 62 65 48 64 34 C 56 31 44 31 36 34 Z',
        'T',
      ],
    ],
    l: ['M 50 31 C 51 26 51 22 50 18', 'M 50 18 C 59 18 67 22 73 29', ring(50, 54, 7)],
  },

  'toy-lube': {
    name: 'Lube',
    group: 'Market',
    hex: C,
    t: 'none',
    use: 'Lubricant and personal lubricants.',
    f: [
      [
        'M 40 40 C 39 54 39 68 40 80 C 47 82 53 82 60 80 C 61 68 61 54 60 40 C 53 38 47 38 40 40 Z',
        'T',
      ],
    ],
    l: [
      'M 45 38 C 46.5 33.1 46.5 29.1 46 26 C 50 25 54 25 56 26',
      'M 56 26 C 61 24 65 22 69 22',
      ring(50, 58, 7),
    ],
  },

  'toy-poppers': {
    name: 'Poppers',
    group: 'Market',
    hex: M,
    t: 'none',
    use: 'Poppers and inhalants.',
    f: [
      [
        'M 38 44 C 37 58 37 70 38 80 C 46 82 54 82 62 80 C 63 70 63 58 62 44 C 54 42 46 42 38 44 Z',
        'T',
      ],
    ],
    l: [
      'M 43 42 C 44.5 34.1 44.5 28.1 44 24 C 50 22 56 23 57 24 C 56.5 28.1 56.5 35.1 58 42',
      ring(50, 62, 7),
    ],
  },

  // A rolled condom in profile — reservoir tip over the ring. Drawn as a
  // packet first, which rendered as a CAMERA: a rounded rectangle with a
  // centred ring is a lens, and no amount of tear-edge detail beat that read.
  'toy-condom': {
    name: 'Condom',
    group: 'Market',
    hex: G,
    t: 'none',
    use: 'Condoms and barrier protection.',
    f: [
      [
        'M 50 20 C 46 20 44 24 44 28 C 44 32 42 35 38 37 C 30 41 26 49 26 57 C 26 70 36 80 50 80 C 64 80 74 70 74 57 C 74 49 70 41 62 37 C 58 35 56 32 56 28 C 56 24 54 20 50 20 Z',
        'T',
      ],
      [ring(50, 57, 12), 'P'],
    ],
  },

  // A boot. `fetish_gear`'s fine buckets are latex / leather / rubber-neoprene
  // / uniforms, i.e. the group is about GARMENT MATERIAL, so the mark is a
  // garment. First drawn as a buckled strap, which at this stroke weight was
  // an unreadable flat lozenge with a dot in it.
  'gear-fetish': {
    name: 'Fetish gear',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Latex, leather, rubber and uniform gear.',
    // NO STATION DOT. The boot's shaft leaves ~11 units of clear interior once
    // its own outline is drawn, and the counter floor is 16 wide plus a stroke,
    // so an open hole does not fit at any centre. At r=7 it did not render as a
    // hole at all — §8 says simplify what you cannot read, and the silhouette
    // is what names this icon anyway.
    f: [
      [
        'M 36 18 C 35 32 35 46 36 58 C 36 70 42 76 52 78 C 62 80 72 80 80 78 C 82 74 82 70 80 66 C 72 64 66 60 62 54 C 60 44 60 30 60 18 C 52 16 44 16 36 18 Z',
        'T',
      ],
    ],
    // ONE strap across the shaft, running a few units past it on both sides.
    // The silhouette alone was offered as a sock and as the letter L: a
    // right-angled mass names no object on its own. A strap is the detail that
    // separates a boot from every soft thing this shape could be, and it has
    // to overhang the shaft or it reads as a seam.
    l: ['M 32 34 C 40 31 56 31 64 34'],
  },

  'gear-harness': {
    name: 'Harness',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Harnesses and body gear.',
    // Four straps converging on a centre ring from four corners is an X with a
    // dot — a level crossing, which is what the sheet offered, and a mark this
    // set can least afford on a wayfinding-shaped brand. A harness is not
    // symmetric about the horizontal: the straps come over the SHOULDERS, the
    // O-ring sits at the sternum, and a band runs round the chest below it. The
    // asymmetry is the fix; the parts are unchanged.
    l: [
      ...tinted(
        `M 28 20 C 34 30 40 33 48 35 M 72 20 C 66 30 60 33 52 35 ${ring(50, 44, 10)} M 22 60 C 34 68 66 68 78 60`,
      ),
    ],
  },

  // Ball between two straps. The strap was first drawn as a lens ENVELOPE
  // around the ball; at stroke-width 9 the two merged into a flat eye and the
  // ball stopped reading as a ball. Straps now stop at the ball's edge.
  'gear-gag': {
    name: 'Gag',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Gags and mouth gear.',
    f: [[ring(50, 50, 14), 'T']],
    l: [
      'M 14 44 C 13 50 13 54 14 60',
      'M 86 44 C 87 50 87 54 86 60',
      'M 14 50 C 21 46 28 45 34 47',
      'M 86 50 C 78.2 46.5 72.2 45.5 66 47',
    ],
  },

  'gear-hood': {
    name: 'Hood',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Hoods, masks and sensory deprivation gear.',
    // §7.1 FORBIDS FACES AND THIS WAS ONE. Two eye strokes and a mouth ring on
    // a head-shaped oval is the §8.4 failure stated almost word for word: two
    // horizontal curves across an ellipse read as a face, and here they were
    // meant to.
    //
    // The silhouette is the other half of the fix. A head-shaped mass with ANY
    // interior mark reads as a head, so the hood now hangs the way it does on a
    // rack — dome at the top flaring to a collar at the bottom — which is a
    // garment rather than a head, and the one interior mark is its zip.
    f: [
      [
        'M 50 16 C 38 16 30 24 30 36 C 30 46 26 56 24 66 C 24 74 36 80 50 80 C 64 80 76 74 76 66 C 74 56 70 46 70 36 C 70 24 62 16 50 16 Z',
        'T',
      ],
    ],
    // The zip is SHORT and the hem does the rest. Run crown-to-collar it was
    // one unbroken dark slot down the middle of a dome — a keyhole, not a zip
    // — and the pull sat close enough to the end to merge into it at every
    // size, making the slot longer still. Cut to the upper half it reads as a
    // fastening, and the hem band is what says garment; it is also the mark
    // `gear-pup` carries, so the two read as one family rather than as two
    // unrelated domes.
    l: ['M 50 24 C 48.5 34 48.5 44 50 54', 'M 28 70 C 38 74 62 74 72 70'],
  },

  'gear-pup': {
    name: 'Pup hood',
    group: 'Kink',
    hex: M,
    t: 'none',
    use: 'Pup play hoods and petplay gear.',
    // Same §7.1 failure as `gear-hood`: the ears were fine and the snout ring
    // was a nose, so ears plus nose on an oval is a dog's face. The ears stay
    // because they are the whole identity of a pup hood; the snout goes, the
    // silhouette becomes the hanging garment, and the hem band replaces it —
    // garment detail cannot be mistaken for a feature.
    //
    // Deliberately NO zip here, unlike `gear-hood`: a vertical line down the
    // centre of a dome that already has two ears reads as a muzzle.
    f: [
      [
        'M 50 26 C 38 26 32 34 32 44 C 32 54 28 62 26 70 C 26 77 37 82 50 82 C 63 82 74 77 74 70 C 72 62 68 54 68 44 C 68 34 62 26 50 26 Z',
        'T',
      ],
    ],
    l: [
      'M 33 38 C 27 28 31 20 39 22 C 43 24 45 28 46 32',
      'M 67 38 C 73 28 69 20 61 22 C 57 24 55 28 54 32',
      'M 28 72 C 38 76 62 76 72 72',
    ],
  },

  // ── Health stops (glossary glyph pass) ───────────────────────────────────
  // Both join the roundel family (`health`, `hours`, `compass`, `consent`,
  // `add-station`, `info-point`): the roundel is the house way of saying
  // "service / station", which is what a health resource is.

  // A capsule lying DIAGONALLY across the roundel. Deliberately NOT a
  // crossed-out pill: a slash reads as prohibition, which inverts the politics
  // of harm-reduction content and would be the worst mark on the site. The
  // diagonal is load-bearing, not styling — a VERTICAL capsule is `info-point`
  // with its dot swallowed.
  'harm-reduction': {
    name: 'Harm reduction',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Harm reduction, drug checking and safer use.',
    f: [[ring(50, 50, 34), 'T']],
    // A PAPER capsule with an ink casing, not an ink bar. As a single thick ink
    // stroke this was a solid diagonal across a roundel — a PROHIBITION SLASH,
    // which is the exact read this mark's author rejected, because crossing out
    // a pill inverts the politics of harm-reduction content. The paper core is
    // what turns the bar back into a pill.
    l: [
      ['M 34 61 C 42.8 57.2 58.8 45.2 66 39', null, 2.4],
      ['M 34 61 C 42.8 57.2 58.8 45.2 66 39', 'P', 1.3],
    ],
  },

  // A belly curve spanning the roundel nearly wall to wall. The near miss is
  // `consent` (roundel + one angular stroke at the same scale), so the
  // mitigation is structural: `consent`'s check is a narrow V parked low and
  // left, this is a wide shallow arc crossing the full width.
  'body-health': {
    name: 'Body health',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Body and reproductive health resources.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 26 42 C 36 70 64 70 74 42'],
  },
  // Interface set (replaced lucide-react). One file per drawing batch.
  ...BATCH_A,
  ...BATCH_B,
  ...BATCH_C,
  ...BATCH_D,
  ...BATCH_E,
  ...BATCH_F,
  ...BATCH_G,
} satisfies Record<string, IconDef>;

/** Every icon slug in the set, as a literal union. */
export type IconName = keyof typeof DEFS;

export const ICON_DEFS: Record<IconName, IconDef> = DEFS;

/**
 * The flattened ink-only path for one icon: every distinct path it draws, in
 * order, deduplicated.
 *
 * Deduplication is what makes the ink-under / colour-over stroke pair collapse
 * back to one copy — a line drawing stores the same `d` twice, and emitting it
 * twice would double-stroke the monochrome rendition and break the byte
 * comparison `brandAssetSync.test.ts` makes against `public/favicon.svg`.
 *
 * It lives here rather than beside the renderer because it is a derivation of
 * the DATA, and because `transitIconPaths.ts` needs it: putting it in
 * `TransitIcon.tsx` makes that import cycle back through the component.
 */
export function inkPathOf(def: IconDef): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (d: string) => {
    if (seen.has(d)) return;
    seen.add(d);
    out.push(d);
  };
  // An unoutlined band (outline weight 0) contributes no ink, so it must not
  // join the mono path either — in mono every path in it is STROKED, so a
  // colour band would come back as a second outline the colour render does not
  // draw.
  for (const [d, , outline] of def.f ?? []) if (outline !== 0) take(d);
  for (const s of def.l ?? []) take(typeof s === 'string' ? s : s[0]);
  return out.join(' ');
}

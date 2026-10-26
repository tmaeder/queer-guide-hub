import { C, G, M, Y, colored, ring, tinted, type IconDef } from '../iconKit';

/** Icon System v2 — batch e of the interface set that replaced lucide-react.
 *  Travel, transport and amenities. */

type Pt = [number, number];
const n = (v: number) => String(Math.round(v * 100) / 100);

/** A bowed cubic from `a` to `b`: controls at thirds, pushed `bow` units to the
 *  right of travel (outward on a clockwise-on-screen outline). Every edge
 *  bends, so a polygon drawn with this obeys §4 without hand-tuning. */
function bowed(a: Pt, b: Pt, bow: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [(-dy / len) * bow, (dx / len) * bow];
  return `C ${n(a[0] + dx / 3 + nx)} ${n(a[1] + dy / 3 + ny)} ${n(a[0] + (2 * dx) / 3 + nx)} ${n(a[1] + (2 * dy) / 3 + ny)} ${n(b[0])} ${n(b[1])}`;
}

/** Open stroke through points. */
function line(pts: Pt[], bow = 1.6): string {
  return `M ${n(pts[0][0])} ${n(pts[0][1])} ${pts
    .slice(1)
    .map((p, i) => bowed(pts[i], p, bow))
    .join(' ')}`;
}

/** Closed shape through points, clockwise on screen, ending back on the start. */
function poly(pts: Pt[], bow = 1.6): string {
  return `${line([...pts, pts[0]], bow)} Z`;
}

/** Ellipse as four cubics. */
function ell(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  return [
    `M ${n(cx + rx)} ${n(cy)}`,
    `C ${n(cx + rx)} ${n(cy + k * ry)} ${n(cx + k * rx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}`,
    `C ${n(cx - k * rx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + k * ry)} ${n(cx - rx)} ${n(cy)}`,
    `C ${n(cx - rx)} ${n(cy - k * ry)} ${n(cx - k * rx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}`,
    `C ${n(cx + k * rx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - k * ry)} ${n(cx + rx)} ${n(cy)} Z`,
  ].join(' ');
}

/** Rounded rectangle with gently bowed sides. */
function rr(x1: number, y1: number, x2: number, y2: number, r: number, b = 1.2): string {
  const w = x2 - x1 - 2 * r;
  const h = y2 - y1 - 2 * r;
  const q = r * 0.45;
  return [
    `M ${n(x1)} ${n(y1 + r)}`,
    `C ${n(x1)} ${n(y1 + r - q)} ${n(x1 + r - q)} ${n(y1)} ${n(x1 + r)} ${n(y1)}`,
    `C ${n(x1 + r + w / 3)} ${n(y1 - b)} ${n(x2 - r - w / 3)} ${n(y1 - b)} ${n(x2 - r)} ${n(y1)}`,
    `C ${n(x2 - r + q)} ${n(y1)} ${n(x2)} ${n(y1 + r - q)} ${n(x2)} ${n(y1 + r)}`,
    `C ${n(x2 + b)} ${n(y1 + r + h / 3)} ${n(x2 + b)} ${n(y2 - r - h / 3)} ${n(x2)} ${n(y2 - r)}`,
    `C ${n(x2)} ${n(y2 - r + q)} ${n(x2 - r + q)} ${n(y2)} ${n(x2 - r)} ${n(y2)}`,
    `C ${n(x2 - r - w / 3)} ${n(y2 + b)} ${n(x1 + r + w / 3)} ${n(y2 + b)} ${n(x1 + r)} ${n(y2)}`,
    `C ${n(x1 + r - q)} ${n(y2)} ${n(x1)} ${n(y2 - r + q)} ${n(x1)} ${n(y2 - r)}`,
    `C ${n(x1 - b)} ${n(y2 - r - h / 3)} ${n(x1 - b)} ${n(y1 + r + h / 3)} ${n(x1)} ${n(y1 + r)} Z`,
  ].join(' ');
}

const wifiArcs = [
  'M 16 44 C 36 24 64 24 84 44',
  'M 28 56 C 42 44 58 44 72 56',
  'M 40 68 C 46 62 54 62 60 68',
].join(' ');

export const BATCH_E = {
  plane: {
    name: 'Flight',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Flights, airports and air travel.',
    f: [
      [
        poly(
          [
            [50, 14],
            [56, 30],
            [56, 42],
            [86, 58],
            [85, 65],
            [56, 58],
            [55, 74],
            [66, 82],
            [64, 86],
            [50, 82],
            [36, 86],
            [34, 82],
            [45, 74],
            [44, 58],
            [15, 65],
            [14, 58],
            [44, 42],
            [44, 30],
          ],
          1.5,
        ),
        'T',
      ],
    ],
  },

  luggage: {
    name: 'Luggage',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Baggage, packing lists and luggage storage.',
    f: [[rr(22, 34, 78, 84, 9), 'T']],
    l: [
      'M 40 34 C 39 26 42 22 50 22 C 58 22 61 26 60 34',
      'M 38 46 C 37 55 37 63 38 72',
      'M 62 46 C 63 55 63 63 62 72',
    ],
  },

  globe: {
    name: 'Globe',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Countries, languages and worldwide content.',
    f: [[ring(50, 50, 34), 'T']],
    l: ['M 50 16 C 36 30 36 70 50 84 C 64 70 64 30 50 16', 'M 16 50 C 38 53 62 53 84 50'],
  },

  locate: {
    name: 'Locate me',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Use my location and current position.',
    f: [
      [
        poly([
          [82, 18],
          [58, 82],
          [48, 54],
          [18, 44],
        ]),
        'T',
      ],
    ],
  },

  car: {
    name: 'Car',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Taxis, car hire, driving and rideshare.',
    f: [
      [
        poly([
          [38, 30],
          [62, 30],
          [72, 46],
          [84, 50],
          [84, 66],
          [16, 66],
          [16, 50],
          [28, 46],
        ]),
        'T',
      ],
      [
        poly([
          [41, 36],
          [59, 36],
          [65, 47],
          [35, 47],
        ]),
        'P',
      ],
      [ring(32, 68, 9), 'P'],
      [ring(68, 68, 9), 'P'],
    ],
  },

  train: {
    name: 'Train',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Trains, trams, buses and public transport.',
    f: [
      [rr(26, 16, 74, 74, 12), 'T'],
      [rr(33, 25, 67, 47, 4), 'P'],
    ],
    l: [ring(38, 61, 3), ring(62, 61, 3), 'M 36 74 C 33 77 32 82 29 86', 'M 64 74 C 67 77 68 82 71 86'],
  },

  boat: {
    name: 'Ferry',
    group: 'Travel',
    hex: C,
    t: 'none',
    use: 'Ferries, boat trips and cruises.',
    f: [
      [rr(34, 38, 66, 60, 4), 'T'],
      [
        poly([
          [14, 56],
          [86, 56],
          [74, 80],
          [26, 80],
        ]),
        'T',
      ],
    ],
    l: ['M 50 38 C 49 32 49 26 50 20'],
  },

  bike: {
    name: 'Bicycle',
    group: 'Travel',
    hex: G,
    t: 'none',
    use: 'Cycling, bike hire and bike routes.',
    l: [
      ...tinted(`${ring(28, 64, 14)} ${ring(72, 64, 14)}`),
      line([
        [28, 64],
        [42, 42],
        [64, 42],
        [72, 64],
      ]),
      line([
        [42, 42],
        [50, 64],
        [64, 42],
      ]),
      'M 36 36 C 40 34.5 44 34.5 48 36',
      'M 60 32 C 63 34 64 38 64 42',
    ],
  },

  walk: {
    name: 'Footprints',
    group: 'Travel',
    hex: G,
    t: 'none',
    use: 'Walking routes, tours and distance on foot.',
    f: [
      [ell(32, 34, 11, 17), 'T'],
      [ell(32, 62, 8, 7), 'T'],
      [ell(68, 50, 11, 17), 'T'],
      [ell(68, 78, 8, 7), 'T'],
    ],
  },

  building: {
    name: 'Building',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Organisations, offices and businesses.',
    f: [
      [rr(26, 14, 74, 86, 5), 'T'],
      [rr(42, 64, 58, 86, 6), 'P'],
    ],
    l: [
      'M 36 28 C 38 26.5 41 26.5 43 28',
      'M 57 28 C 59 26.5 62 26.5 64 28',
      'M 36 41 C 38 39.5 41 39.5 43 41',
      'M 57 41 C 59 39.5 62 39.5 64 41',
      'M 36 54 C 38 52.5 41 52.5 43 54',
      'M 57 54 C 59 52.5 62 52.5 64 54',
    ],
  },

  parking: {
    name: 'Parking',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Car parks and parking near a venue.',
    f: [
      [rr(16, 16, 84, 84, 12), 'T'],
      [rr(38, 30, 62, 70, 9), 'P'],
    ],
    l: [
      'M 27 26 C 25.5 42 25.5 58 27 74',
      'M 73 26 C 74.5 42 74.5 58 73 74',
      'M 42 44 C 47 42.5 53 42.5 58 44',
    ],
  },

  pet: {
    name: 'Pet friendly',
    group: 'Places',
    hex: G,
    t: 'none',
    use: 'Pet-friendly venues, stays and dog walks.',
    f: [
      [
        'M 50 46 C 62 46 72 58 74 68 C 76 78 68 84 60 82 C 56 81 53 78 50 78 C 47 78 44 81 40 82 C 32 84 24 78 26 68 C 28 58 38 46 50 46 Z',
        'T',
      ],
      [ell(23, 44, 8, 10), 'T'],
      [ell(40, 26, 8, 11), 'T'],
      [ell(60, 26, 8, 11), 'T'],
      [ell(77, 44, 8, 10), 'T'],
    ],
  },

  baby: {
    name: 'Baby friendly',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Family-friendly venues, changing rooms and prams.',
    f: [
      ['M 18 46 C 22 60 34 66 50 66 C 66 66 78 60 82 46 C 61 44 39 44 18 46 Z', 'T'],
      ['M 18 46 C 17 30 28 18 46 16 C 47.5 26 47.5 36 46 45 C 36 46.5 27 46.5 18 46 Z', 'T'],
    ],
    l: ['M 82 46 C 82 38 84 32 88 28', ring(34, 77, 9), ring(66, 77, 9)],
  },

  shower: {
    name: 'Shower',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Showers, baths and wash facilities.',
    f: [['M 34 42 C 34 30 42 24 52 24 C 62 24 70 30 70 42 C 58 44 46 44 34 42 Z', 'T']],
    l: [
      'M 52 24 C 51 18 46 15 38 15 C 30 15 24 20 24 28 C 22.5 48 22.5 68 24 86',
      'M 42 52 C 42 58 40 63 37 68',
      'M 52 52 C 53.5 58 53.5 63 52 70',
      'M 62 52 C 62 58 64 63 68 68',
      'M 44 76 C 44.5 79 43 81 42 84',
      'M 60 76 C 59.5 79 61 81 62 84',
    ],
  },

  laundry: {
    name: 'Laundry',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Laundry, washing machines and launderettes.',
    f: [
      [rr(20, 14, 80, 86, 9), 'T'],
      [ring(50, 58, 19), 'P'],
    ],
    l: [
      'M 21 30 C 40 31.5 60 31.5 79 30',
      ring(68, 22, 2.5),
      'M 38 62 C 44 55 50 68 56 60 C 58 58 60 58 62 59',
    ],
  },

  door: {
    name: 'Door',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Entrances, door policy and access.',
    f: [[rr(28, 14, 72, 84, 5), 'T']],
    l: [ring(61, 52, 3.5), 'M 16 86 C 38 87.5 62 87.5 84 86'],
  },

  ear: {
    name: 'Hearing access',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Hearing loops and deaf-accessible venues.',
    l: [
      ...colored(
        'M 30 40 C 30 24 41 15 54 15 C 68 15 76 25 76 37 C 76 50 68 54 63 62 C 59 69 61 80 50 84 C 43 86 37 84 33 79',
      ),
      'M 45 42 C 44 34 50 30 56 30 C 62 30 65 35 64 41 C 63 47 57 48 55 54',
    ],
  },

  wifi: {
    name: 'Wi-Fi',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Free Wi-Fi and internet access.',
    l: [...tinted(wifiArcs), ring(50, 78, 4)],
  },

  'wifi-off': {
    name: 'No Wi-Fi',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Offline state and no connection.',
    l: [...tinted(wifiArcs), ring(50, 78, 4), 'M 18 18 C 40 38 60 60 82 84'],
  },

  cookie: {
    name: 'Cookie',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Cookie consent and tracking preferences.',
    f: [
      [
        'M 50 16 C 31 16 16 31 16 50 C 16 69 31 84 50 84 C 69 84 84 69 84 52 C 77 54 70 49 70 42 C 62 42 57 36 58 28 C 53 27 50 22 50 16 Z',
        'T',
      ],
    ],
    l: [ring(36, 40, 4), ring(56, 64, 4), ring(34, 64, 4), ring(66, 50, 3.5)],
  },

  cake: {
    name: 'Birthday',
    group: 'Events',
    hex: Y,
    t: 'none',
    use: 'Birthdays and anniversaries.',
    f: [
      [rr(18, 50, 82, 84, 7), 'T'],
      ['M 50 14 C 56 21 58 26 55 30 C 53 33 47 33 45 30 C 42 26 44 21 50 14 Z', 'T'],
    ],
    l: [
      'M 50 50 C 49 44 49 40 50 36',
      'M 19 64 C 28 71 34 58 42 65 C 50 72 56 58 64 65 C 70 70 76 62 81 63',
    ],
  },

  party: {
    name: 'Party popper',
    group: 'Events',
    hex: Y,
    t: 'burst',
    use: 'Celebrations, parties and good news.',
    f: [
      [
        poly([
          [38, 40],
          [60, 62],
          [16, 84],
        ]),
        'T',
      ],
    ],
    l: [
      'M 46 32 C 49 26 44 22 48 15',
      'M 66 52 C 72 48 77 53 84 50',
      'M 60 38 C 66 31 72 31 78 24',
      ring(64, 20, 3.5),
      ring(82, 36, 3.5),
      ring(80, 66, 3.5),
    ],
  },

  dice: {
    name: 'Dice',
    group: 'Events',
    hex: Y,
    t: 'none',
    use: 'Games nights, board games and gambling.',
    f: [[rr(18, 18, 82, 82, 12), 'T']],
    l: [ring(35, 35, 4.5), ring(65, 35, 4.5), ring(50, 50, 4.5), ring(35, 65, 4.5), ring(65, 65, 4.5)],
  },

  leaf: {
    name: 'Leaf',
    group: 'Places',
    hex: G,
    t: 'none',
    use: 'Nature, gardens, plants and eco options.',
    f: [['M 22 78 C 20 44 40 20 82 18 C 82 58 60 80 22 78 Z', 'T']],
    l: ['M 24 76 C 38 60 54 48 68 32', 'M 24 76 C 23 80 19 82 15 86'],
  },

  waves: {
    name: 'Waves',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Beaches, lakes, swimming and water.',
    l: tinted(
      [32, 50, 68]
        .map(
          (y) =>
            `M 16 ${y} C 24 ${y - 8} 32 ${y - 8} 40 ${y} C 48 ${y + 8} 56 ${y + 8} 64 ${y} C 70 ${y - 6} 78 ${y - 7} 84 ${y - 2}`,
        )
        .join(' '),
    ),
  },
} satisfies Record<string, IconDef>;

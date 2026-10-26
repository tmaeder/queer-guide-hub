import { C, G, M, Y, colored, flipX, ring, rot, tinted, type IconDef } from '../iconKit';

/** Icon System v2 — batch f of the interface set that replaced lucide-react.
 *  Weather & media. The four cloud icons share ONE master silhouette, scaled
 *  and lifted by `cloud()`, so the family cannot drift apart. */

/** The cloud master: absolute M / C / Z only, so every number pair is a point. */
const CLOUD =
  'M 28 72 C 18 72 14 64 14 57 C 14 49 20 43 28 43 C 30 32 39 26 49 26 C 59 26 67 32 69 41 C 79 41 86 48 86 57 C 86 65 80 72 72 72 C 57 73.5 43 73.5 28 72 Z';

/** Scale the master about 50,50 by `s`, then lift it by `dy`. */
function cloud(s: number, dy: number): string {
  let k = 0;
  return CLOUD.replace(/-?\d+(?:\.\d+)?/g, (n) => {
    const v = 50 + (Number(n) - 50) * s + (k++ % 2 === 1 ? dy : 0);
    return String(Math.round(v * 10) / 10);
  });
}

/** A short radial stroke, bowed 1.5 units so it is a curve, not a line. */
function ray(deg: number, r0: number, r1: number): string {
  const a = (deg * Math.PI) / 180;
  const [cx, cy] = [Math.cos(a), Math.sin(a)];
  const [px, py] = [-cy * 1.5, cx * 1.5];
  const pt = (r: number, o = 0) =>
    `${Math.round((50 + cx * r + px * o) * 10) / 10} ${Math.round((50 + cy * r + py * o) * 10) / 10}`;
  const m = (r0 + r1) / 2;
  return `M ${pt(r0)} C ${pt(m - 2, 1)} ${pt(m + 2, 1)} ${pt(r1)}`;
}

/** A cubic from the current point to x1,y1 bowed `o` units off the chord. */
function bow(x0: number, y0: number, x1: number, y1: number, o = 2): string {
  const [dx, dy] = [x1 - x0, y1 - y0];
  const len = Math.hypot(dx, dy);
  const [px, py] = [(-dy / len) * o, (dx / len) * o];
  const r = (n: number) => Math.round(n * 10) / 10;
  return `C ${r(x0 + dx / 3 + px)} ${r(y0 + dy / 3 + py)} ${r(x0 + (2 * dx) / 3 + px)} ${r(y0 + (2 * dy) / 3 + py)} ${x1} ${y1}`;
}

/** A closed polygon of bowed cubics through the given points. */
function poly(pts: [number, number][], o = 2): string {
  const segs = pts.map(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return bow(x, y, nx, ny, o);
  });
  return `M ${pts[0][0]} ${pts[0][1]} ${segs.join(' ')} Z`;
}

/** A lifted cloud for weather that falls out of it. */
const SKY = cloud(0.85, -14);

const SPEAKER = poly(
  [
    [16, 40],
    [30, 40],
    [48, 22],
    [48, 78],
    [30, 60],
    [16, 60],
  ],
  -1.5,
);

const TREND_UP = `M 16 72 ${bow(16, 72, 36, 52)} ${bow(36, 52, 52, 64)} ${bow(52, 64, 76, 34)} M 58 32 ${bow(58, 32, 80, 30)} ${bow(80, 30, 80, 50)}`;

export const BATCH_F = {
  // ── Weather ──────────────────────────────────────────────────────────────
  sun: {
    name: 'Sunshine',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Sunny weather, daytime and the light theme.',
    f: [[ring(50, 50, 18), 'T']],
    l: [[0, 45, 90, 135, 180, 225, 270, 315].map((d) => ray(d, 29, 38)).join(' ')],
  },

  // Not `after-dark`: that crescent is pink and bulges left. This one is the
  // classic lower-left crescent with a star, in yellow, so the theme toggle
  // never reads as "late-night venues".
  moon: {
    name: 'Crescent moon',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Night-time, clear evenings and the dark theme.',
    f: [
      [
        'M 58 16 C 36 18 18 34 18 54 C 18 72 32 86 52 86 C 66 86 78 76 84 62 C 76 66 70 68 62 68 C 46 68 34 56 34 40 C 34 30 44 20 58 16 Z',
        'T',
      ],
    ],
    l: ['M 72 18 C 71 23 71 28 72 34 M 64 26 C 69 25 75 25 80 26'],
  },

  cloud: {
    name: 'Cloudy',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Cloudy, overcast or foggy weather.',
    f: [[CLOUD, 'T']],
  },

  rain: {
    name: 'Rainfall',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Rain, drizzle and wet-weather forecasts.',
    f: [[SKY, 'T']],
    l: [
      'M 36 64 C 35 70 33 74 30 80',
      'M 52 64 C 51 70 49 74 46 80',
      'M 68 64 C 67 70 65 74 62 80',
    ],
  },

  // Dots, not six-armed flakes: a flake is a star at 16px.
  snow: {
    name: 'Snowfall',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Snow and cold-weather forecasts.',
    f: [[SKY, 'T']],
    l: [`${ring(34, 68, 3.5)} ${ring(66, 68, 3.5)} ${ring(50, 80, 3.5)}`],
  },

  // The bolt carries the colour, so the cloud goes paper and the bolt paints
  // over its lower edge.
  storm: {
    name: 'Thunderstorm',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Storms, lightning and severe weather.',
    f: [
      [SKY, 'P'],
      [
        poly([
          [50, 38],
          [30, 68],
          [47, 68],
          [40, 87],
          [72, 52],
          [55, 52],
          [66, 38],
        ]),
        'T',
      ],
    ],
  },

  wind: {
    name: 'Wind',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Wind, breeze and ventilation.',
    l: tinted(
      'M 14 38 C 34 36 50 40 60 38 C 70 36 72 24 64 22 C 58 21 54 26 57 30 M 14 54 C 36 52 56 56 72 54 C 82 53 86 62 80 68 C 75 72 68 70 69 64 M 18 72 C 28 70 36 74 46 72',
    ),
  },

  drop: {
    name: 'Water drop',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Water, humidity and drinking-water points.',
    f: [
      [
        'M 50 14 C 58 28 72 42 72 58 C 72 72 62 82 50 82 C 38 82 28 72 28 58 C 28 42 42 28 50 14 Z',
        'T',
      ],
    ],
  },

  // The tube is paper because its interior is too narrow to show colour at
  // the small-size stroke; the bulb carries the colour.
  thermometer: {
    name: 'Thermometer',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Temperature readings and forecasts.',
    f: [
      [
        'M 40 26 C 40 19 44 16 50 16 C 56 16 60 19 60 26 C 61 38 61 50 60 62 C 54 63.5 46 63.5 40 62 C 39 50 39 38 40 26 Z',
        'P',
      ],
      [ring(50, 70, 14), 'T'],
    ],
    l: ['M 68 28 C 71 27 73 27 76 28', 'M 68 40 C 71 39 73 39 76 40', 'M 68 52 C 71 51 73 51 76 52'],
  },

  // ── Media ────────────────────────────────────────────────────────────────
  // Headphones, not a note: `nightlife` is already a beamed pair of notes.
  music: {
    name: 'Music',
    group: 'Events',
    hex: M,
    t: 'none',
    use: 'Music, radio, playlists and listening.',
    f: [
      [
        'M 22 54 C 28 52 33 54 34 58 C 35 64 35 72 34 78 C 32 81 26 82 22 80 C 17 78 16 72 16 67 C 16 62 17 56 22 54 Z',
        'T',
      ],
      [
        'M 78 54 C 72 52 67 54 66 58 C 65 64 65 72 66 78 C 68 81 74 82 78 80 C 83 78 84 72 84 67 C 84 62 83 56 78 54 Z',
        'T',
      ],
    ],
    l: ['M 20 60 C 18 34 32 20 50 20 C 68 20 82 34 80 60'],
  },

  mic: {
    name: 'Microphone',
    group: 'Events',
    hex: M,
    t: 'none',
    use: 'Voice input, podcasts, karaoke and open mics.',
    f: [
      [
        'M 50 14 C 56 14 60 18 60 24 C 61 31 61 38 60 44 C 60 50 56 54 50 54 C 44 54 40 50 40 44 C 39 38 39 31 40 24 C 40 18 44 14 50 14 Z',
        'T',
      ],
    ],
    l: [
      'M 26 44 C 26 60 36 70 50 70 C 64 70 74 60 74 44',
      'M 50 70 C 48.5 75 48.5 79 50 84',
      'M 38 85 C 46 83.5 54 83.5 62 85',
    ],
  },

  volume: {
    name: 'Volume',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Sound on and volume controls.',
    f: [[SPEAKER, 'T']],
    l: ['M 60 40 C 65 45 65 55 60 60', 'M 70 28 C 82 40 82 60 70 72'],
  },

  mute: {
    name: 'Muted sound',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Sound off and muted media.',
    f: [[SPEAKER, 'T']],
    l: ['M 60 38 C 67 44 73 50 82 62', 'M 82 38 C 75 44 69 50 60 62'],
  },

  play: {
    name: 'Play',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Start audio or video playback.',
    f: [['M 30 20 C 50 30 66 40 80 50 C 66 60 50 70 30 80 C 28 60 28 40 30 20 Z', 'T']],
  },

  pause: {
    name: 'Pause',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Pause audio or video playback.',
    f: [
      ['M 22 20 C 28 18.5 36 18.5 42 20 C 43.5 40 43.5 60 42 80 C 36 81.5 28 81.5 22 80 C 20.5 60 20.5 40 22 20 Z', 'T'],
      ['M 58 20 C 64 18.5 72 18.5 78 20 C 79.5 40 79.5 60 78 80 C 72 81.5 64 81.5 58 80 C 56.5 60 56.5 40 58 20 Z', 'T'],
    ],
  },

  skip: {
    name: 'Skip forward',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Skip to the next track or item.',
    f: [
      ['M 18 20 C 32 30 44 40 54 50 C 44 60 32 70 18 80 C 16 60 16 40 18 20 Z', 'T'],
      ['M 66 22 C 71 20.5 77 20.5 82 22 C 83.5 40 83.5 60 82 78 C 77 79.5 71 79.5 66 78 C 64.5 60 64.5 40 66 22 Z', 'T'],
    ],
  },

  video: {
    name: 'Video camera',
    group: 'Events',
    hex: Y,
    t: 'none',
    use: 'Videos, films, recordings and video calls.',
    f: [
      [
        'M 22 30 C 32 28.5 46 28.5 56 30 C 60 30 62 33 62 37 C 63 46 63 54 62 63 C 62 67 60 70 56 70 C 46 71.5 32 71.5 22 70 C 17 70 14 67 14 63 C 13 54 13 46 14 37 C 14 33 17 30 22 30 Z',
        'T',
      ],
      [poly([
          [68, 44],
          [86, 32],
          [86, 68],
          [68, 56],
        ], -1.5), 'T'],
    ],
  },

  screen: {
    name: 'Screen',
    group: 'Places',
    hex: C,
    t: 'none',
    use: 'Monitors, TVs, screenings and presentations.',
    f: [
      [
        'M 22 20 C 40 18.5 60 18.5 78 20 C 82 20 84 22 84 26 C 85 38 85 50 84 58 C 84 62 82 64 78 64 C 60 65.5 40 65.5 22 64 C 18 64 16 62 16 58 C 15 50 15 38 16 26 C 16 22 18 20 22 20 Z',
        'T',
      ],
    ],
    l: ['M 50 66 C 48.5 70 48.5 74 50 78', 'M 34 80 C 44 78.5 56 78.5 66 80'],
  },

  // ── Data ─────────────────────────────────────────────────────────────────
  chart: {
    name: 'Bar chart',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Statistics, analytics, dashboards and activity.',
    f: [
      ['M 14 52 C 19 50.5 24 50.5 29 52 C 30.5 62 30.5 72 29 82 C 24 83.5 19 83.5 14 82 C 12.5 72 12.5 62 14 52 Z', 'T'],
      ['M 42 34 C 47 32.5 52 32.5 57 34 C 58.5 50 58.5 66 57 82 C 52 83.5 47 83.5 42 82 C 40.5 66 40.5 50 42 34 Z', 'T'],
      ['M 71 18 C 76 16.5 81 16.5 86 18 C 87.5 40 87.5 60 86 82 C 81 83.5 76 83.5 71 82 C 69.5 60 69.5 40 71 18 Z', 'T'],
    ],
  },

  'trend-up': {
    name: 'Trending up',
    group: 'Signals',
    hex: G,
    t: 'none',
    use: 'Rising numbers, growth and upward trends.',
    l: colored(TREND_UP),
  },

  // The rising master mirrored top-to-bottom, so the pair cannot drift apart.
  'trend-down': {
    name: 'Trending down',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Falling numbers, decline and downward trends.',
    l: colored(rot(flipX(TREND_UP), 2)),
  },
} satisfies Record<string, IconDef>;

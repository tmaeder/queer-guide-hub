import { C, G, M, Y, colored, flipX, ring, tinted, type IconDef, type Stroke } from '../iconKit';

/** Icon System v2 — batch b of the interface set that replaced lucide-react.
 *  Status & signals. The circular glyphs (loader, refresh, history) are built
 *  from `arc()` so they are true circles about 50,50 — the loader spins under
 *  `animate-spin`, which rotates about the box centre, so an off-centre arc
 *  would wobble. */

type Pt = [number, number];
const r1 = (n: number) => Math.round(n * 10) / 10;
const p = ([x, y]: Pt) => `${r1(x)} ${r1(y)}`;

/** A "straight" edge from a to b: a cubic bowed `bow` units off the chord. */
function seg(a: Pt, b: Pt, bow = 1.5): string {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [(-dy / len) * bow, (dx / len) * bow];
  const c1: Pt = [a[0] + dx / 3 + nx, a[1] + dy / 3 + ny];
  const c2: Pt = [a[0] + (2 * dx) / 3 + nx, a[1] + (2 * dy) / 3 + ny];
  return `C ${p(c1)} ${p(c2)} ${p(b)}`;
}

/** Closed polygon with bowed edges. */
function poly(pts: Pt[], bow = 1.5): string {
  return `M ${p(pts[0])} ${pts.map((pt, i) => seg(pt, pts[(i + 1) % pts.length], bow)).join(' ')} Z`;
}

/** Point on a circle; 0° is 12 o'clock, angles grow clockwise. */
const at = (cx: number, cy: number, r: number, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

/** Clockwise circular arc from a0 to a1 (degrees), as ≤90° cubics. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const n = Math.ceil((a1 - a0) / 90);
  const step = (a1 - a0) / n;
  const k = (4 / 3) * Math.tan((step * Math.PI) / 720) * r;
  const parts = [`M ${p(at(cx, cy, r, a0))}`];
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step;
    const e = s + step;
    const [ps, pe] = [at(cx, cy, r, s), at(cx, cy, r, e)];
    const [ts, te] = [(s * Math.PI) / 180, (e * Math.PI) / 180];
    const c1: Pt = [ps[0] + k * Math.cos(ts), ps[1] + k * Math.sin(ts)];
    const c2: Pt = [pe[0] - k * Math.cos(te), pe[1] - k * Math.sin(te)];
    parts.push(`C ${p(c1)} ${p(c2)} ${p(pe)}`);
  }
  return parts.join(' ');
}

/** Chevron arrowhead at `tip`, pointing along unit direction `dir`. */
function head(tip: Pt, dir: Pt, size = 13, spread = 42): string {
  const back = (deg: number): Pt => {
    const a = (deg * Math.PI) / 180;
    const [bx, by] = [-dir[0], -dir[1]];
    return [
      tip[0] + size * (bx * Math.cos(a) - by * Math.sin(a)),
      tip[1] + size * (bx * Math.sin(a) + by * Math.cos(a)),
    ];
  };
  const [l, r] = [back(spread), back(-spread)];
  return `M ${p(l)} ${seg(l, tip, 1.2)} ${seg(tip, r, 1.2)}`;
}

/** Arrowhead at the clockwise END of an arc at angle `deg`. */
const cwHead = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return head(at(cx, cy, r, deg), [Math.cos(a), Math.sin(a)]);
};
/** Arrowhead at the START of an arc, pointing counter-clockwise. */
const ccwHead = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return head(at(cx, cy, r, deg), [-Math.cos(a), -Math.sin(a)]);
};

/** Scalloped seal: N outward lobes. */
function seal(cx: number, cy: number, r: number, lobe: number, n: number): string {
  const step = 360 / n;
  const parts = [`M ${p(at(cx, cy, r, 0))}`];
  for (let i = 0; i < n; i++) {
    const s = i * step;
    parts.push(
      `C ${p(at(cx, cy, r + lobe, s + step * 0.2))} ${p(at(cx, cy, r + lobe, s + step * 0.8))} ${p(at(cx, cy, r, s + step))}`,
    );
  }
  return `${parts.join(' ')} Z`;
}

/** Four-point sparkle: concave edges pulled toward the centre. */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.2;
  const q = (x: number, y: number) => `C ${r1(cx + x * k)} ${r1(cy + y * k)} ${r1(cx + x * k)} ${r1(cy + y * k)}`;
  return `M ${cx} ${cy - r} ${q(1, -1)} ${cx + r} ${cy} ${q(1, 1)} ${cx} ${cy + r} ${q(-1, 1)} ${cx - r} ${cy} ${q(-1, -1)} ${cx} ${cy - r} Z`;
}

/** Five-point star. */
function star(cx: number, cy: number, ro: number, ri: number): Pt[] {
  return Array.from({ length: 10 }, (_, i) => at(cx, cy, i % 2 ? ri : ro, i * 36));
}

/** A slash that cuts through what is under it: a paper band, ink on top. */
const cut = (d: string): Stroke[] => [
  [d, 'P', 2.6],
  [d, null, 1],
];

const BELL =
  'M 30 64 C 30 46 34 30 50 30 C 66 30 70 46 70 64 C 73.1 67.2 75.1 69.2 78 70 C 60 74 40 74 22 70 C 24.9 69.2 26.9 67.2 30 64 Z';
const EYE = 'M 14 50 C 26 30 40 24 50 24 C 60 24 74 30 86 50 C 74 70 60 76 50 76 C 40 76 26 70 14 50 Z';
const UNDO = [
  `M 22 40 ${seg([22, 40], [60, 40])} C 72 40 80 48 80 59 C 80 70 72 78 60 78 ${seg([60, 78], [42, 78])}`,
  head([22, 40], [-1, 0], 15),
];

export const BATCH_B = {
  success: {
    name: 'Success check',
    group: 'Signals',
    hex: G,
    t: 'none',
    use: 'Completed, verified and confirmed states.',
    // A scalloped seal, not a disc: a disc plus a check is already `consent`.
    f: [[seal(50, 50, 30, 7, 9), 'T']],
    l: [`M 35 51 ${seg([35, 51], [46, 63], -1.5)} ${seg([46, 63], [66, 38], -1.5)}`],
  },

  error: {
    name: 'Error mark',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Failed actions, errors and rejected input.',
    f: [[ring(50, 50, 34), 'T']],
    l: [`M 37 37 ${seg([37, 37], [63, 63])}`, `M 63 37 ${seg([63, 37], [37, 63])}`],
  },

  blocked: {
    name: 'Blocked',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Blocked users, banned items and disabled options.',
    l: colored(`${ring(50, 50, 30)} M 29 29 C 37 36.5 63 61.5 71 71`),
  },

  warning: {
    name: 'Warning sign',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Cautions and warnings that need attention.',
    f: [[poly([[50, 17], [85, 78], [15, 78]], -1.5), 'T']],
    l: ['M 50 38 C 48.5 45 48.5 51 50 57', ring(50, 67, 3.5)],
  },

  help: {
    name: 'Help mark',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Help, FAQs and how-it-works prompts.',
    f: [[ring(50, 50, 34), 'T']],
    l: [
      'M 39 40 C 39 31 44 27 50.5 27 C 57.5 27 62 31.5 62 37.5 C 62 45 51 46 50 55 C 48.6 56.5 48.6 57.5 50 59',
      ring(50, 69, 3.5),
    ],
  },

  loader: {
    name: 'Loading spinner',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Loading and pending work; spins about its centre.',
    l: colored(arc(50, 50, 30, 0, 270)),
  },

  refresh: {
    name: 'Refresh arrows',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Reload, retry, repeat and sync.',
    l: tinted(
      `${arc(50, 50, 31, 25, 155)} ${cwHead(50, 50, 31, 155)} ${arc(50, 50, 31, 205, 335)} ${cwHead(50, 50, 31, 335)}`,
    ),
  },

  undo: {
    name: 'Undo arrow',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Undo the last change.',
    l: tinted(UNDO.join(' ')),
  },

  redo: {
    name: 'Redo arrow',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Redo a change that was undone.',
    l: tinted(UNDO.map(flipX).join(' ')),
  },

  history: {
    name: 'History clock',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Past activity, version history and recents.',
    l: tinted(
      `${arc(50, 50, 32, 300, 600)} ${ccwHead(50, 50, 32, 300)} M 50 34 C 48.8 40 48.8 46 50 51 C 55 53 59 56 62 59`,
    ),
  },

  'alerts-off': {
    name: 'Alerts off',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Muted notifications and silenced alerts.',
    f: [[BELL, 'T']],
    l: ['M 44 82 C 48 85 52 85 56 82', 'M 50 30 C 49 26 49 24 50 21', ...cut(`M 22 22 ${seg([22, 22], [78, 80])}`)],
  },

  star: {
    name: 'Star rating',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Ratings, starred items and featured picks.',
    f: [[poly(star(50, 53, 36, 15), 1.2), 'T']],
  },

  sparkle: {
    name: 'Sparkle magic',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'New, highlighted or AI-assisted features.',
    f: [
      [sparkle(42, 56, 30), 'T'],
      [sparkle(73, 27, 13), 'T'],
    ],
  },

  flag: {
    name: 'Report flag',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Report content or flag something for review.',
    f: [
      [
        'M 27 20 C 40 14 53 26 66 20 C 71 19.5 75 16.5 79 17 C 80 30 80 42 79 54 C 66 60 53 48 40 54 C 35 57 31 55 27 57 Z',
        'T',
      ],
    ],
    l: ['M 27 86 C 25.5 62 25.5 38 27 16'],
  },

  dot: {
    name: 'Status dot',
    group: 'Signals',
    hex: C,
    t: 'none',
    use: 'Status indicators, bullets and unselected options.',
    f: [[ring(50, 50, 22), 'T']],
  },

  target: {
    name: 'Target goal',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Goals, focus areas and aiming at something.',
    f: [
      [ring(50, 50, 34), 'T'],
      [ring(50, 50, 21), 'P'],
      [ring(50, 50, 9), 'T'],
    ],
  },

  eye: {
    name: 'Visible eye',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Show, preview, views and visibility on.',
    f: [
      [EYE, 'P'],
      [ring(50, 50, 13), 'T'],
    ],
  },

  'eye-off': {
    name: 'Hidden eye',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Hide, private and visibility off.',
    f: [
      [EYE, 'P'],
      [ring(50, 50, 13), 'T'],
    ],
    l: cut(`M 22 20 ${seg([22, 20], [78, 80])}`),
  },

  idea: {
    name: 'Idea bulb',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Tips, ideas and suggestions.',
    f: [
      [
        'M 40 66 C 40 58 28 52 28 38 C 28 25 38 16 50 16 C 62 16 72 25 72 38 C 72 52 60 58 60 66 C 53 67.5 47 67.5 40 66 Z',
        'T',
      ],
    ],
    l: ['M 41 75 C 47 76.5 53 76.5 59 75', 'M 44 84 C 48 85.5 52 85.5 56 84'],
  },

  zap: {
    name: 'Power bolt',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Power, instant actions and electricity.',
    f: [
      [
        poly(
          [
            [60, 14],
            [25, 55],
            [47, 55],
            [39, 86],
            [76, 43],
            [54, 43],
          ],
          1.2,
        ),
        'T',
      ],
    ],
  },

  flame: {
    name: 'Hot flame',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Trending, popular and hot right now.',
    f: [
      [
        'M 50 86 C 34 86 24 75 24 60 C 24 46 34 38 38 26 C 44 34 46 40 46 46 C 52 38 54 28 52 14 C 66 24 76 40 76 60 C 76 75 66 86 50 86 Z',
        'T',
      ],
      [
        'M 50 80 C 42 80 38 74 38 67 C 38 60 44 56 46 50 C 52 56 62 60 62 68 C 62 75 57 80 50 80 Z',
        'P',
      ],
    ],
  },

  skull: {
    name: 'Danger skull',
    group: 'Safety',
    hex: M,
    t: 'none',
    use: 'Severe danger, lethal risk and poison.',
    f: [
      [
        'M 50 16 C 32 16 20 28 20 46 C 20 56 25 62 32 66 C 31.5 71 31.5 75 33 80 C 44 82 56 82 67 80 C 68.5 75 68.5 71 68 66 C 75 62 80 56 80 46 C 80 28 68 16 50 16 Z',
        'T',
      ],
      [ring(38, 46, 9), 'P'],
      [ring(62, 46, 9), 'P'],
    ],
    l: ['M 44 70 C 43 73.5 43 77 44 80', 'M 56 70 C 57 73.5 57 77 56 80'],
  },

  crown: {
    name: 'Top crown',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Top picks, premium and VIP status.',
    f: [
      [
        poly(
          [
            [18, 76],
            [15, 32],
            [34, 50],
            [50, 22],
            [66, 50],
            [85, 32],
            [82, 76],
          ],
          1.2,
        ),
        'T',
      ],
    ],
  },

  award: {
    name: 'Award medal',
    group: 'Signals',
    hex: Y,
    t: 'none',
    use: 'Awards, achievements, winners and trophies.',
    f: [
      [`M 38 52 ${seg([38, 52], [29, 86])} C 33.5 82 37.5 80 42 82 ${seg([42, 82], [50, 56])} Z`, 'T'],
      [`M 62 52 ${seg([62, 52], [71, 86], -1.5)} C 66.5 82 62.5 80 58 82 ${seg([58, 82], [50, 56], -1.5)} Z`, 'T'],
      [ring(50, 38, 23), 'T'],
      [ring(50, 38, 10), 'P'],
    ],
  },
} satisfies Record<string, IconDef>;

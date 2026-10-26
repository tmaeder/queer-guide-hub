import { C, G, M, Y, colored, ring, tinted, type IconDef } from '../iconKit';

/** Icon System v2 — batch c of the interface set that replaced lucide-react.
 *  Content & data actions.
 *
 *  Drawn through three small builders rather than hand-typed cubics, because
 *  every "straight" edge in this batch (box sides, list rules, tray rims) has
 *  to be a cubic bowed off its own chord, and hand-typing ~400 control points
 *  is how one of them ends up flat. The builders emit only M / C / Z. */

type P = [number, number];
const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = ([x, y]: P) => `${r1(x)} ${r1(y)}`;

/** A cubic from a to b, both control points pushed `bow` units to the left of
 *  travel — a hand-drawn "straight" edge. */
function edge(a: P, b: P, bow = 1.6): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (dy / len) * bow;
  const ny = (-dx / len) * bow;
  const c1: P = [a[0] + dx / 3 + nx, a[1] + dy / 3 + ny];
  const c2: P = [a[0] + (2 * dx) / 3 + nx, a[1] + (2 * dy) / 3 + ny];
  return `C ${pt(c1)} ${pt(c2)} ${pt(b)}`;
}

/** Corner points cut `r` back along both edges meeting at v. */
function cut(prev: P, v: P, next: P, r: number): [P, P] {
  const along = (to: P): P => {
    const dx = to[0] - v[0];
    const dy = to[1] - v[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(r, len / 2) / len;
    return [v[0] + dx * k, v[1] + dy * k];
  };
  return [along(prev), along(next)];
}

/** Rounded corner cubic from a to b around vertex v. */
const corner = (a: P, v: P, b: P) =>
  `C ${pt([a[0] + (v[0] - a[0]) * 0.55, a[1] + (v[1] - a[1]) * 0.55])} ${pt([
    b[0] + (v[0] - b[0]) * 0.55,
    b[1] + (v[1] - b[1]) * 0.55,
  ])} ${pt(b)}`;

/** A closed polygon with rounded corners (radius r, per-vertex override via
 *  a third element) and bowed edges. Runs clockwise on screen so a positive
 *  bow pushes every edge outward. */
function poly(pts: (P | [number, number, number])[], r = 6, bow = 1.4): string {
  const v = pts.map((p) => [p[0], p[1]] as P);
  const n = v.length;
  // A rounding too small to bow its own cubic is drawn as a sharp corner.
  const rr = pts.map((p, i) => {
    const want = p.length === 3 ? p[2] : r;
    const [a, b] = cut(v[(i - 1 + n) % n], v[i], v[(i + 1) % n], want);
    const c: P = [a[0] + (v[i][0] - a[0]) * 0.55, a[1] + (v[i][1] - a[1]) * 0.55];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const off = Math.abs((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])) / len;
    return off < 1.2 ? 0 : want;
  });
  const cuts = v.map((p, i) => cut(v[(i - 1 + n) % n], p, v[(i + 1) % n], rr[i]));
  let d = `M ${pt(cuts[0][1])}`;
  for (let i = 1; i <= n; i++) {
    const k = i % n;
    d += ` ${edge(cuts[i - 1][1], cuts[k][0], bow)}`;
    d += rr[k] > 0 ? ` ${corner(cuts[k][0], v[k], cuts[k][1])}` : '';
  }
  return `${d} Z`;
}

/** An open polyline with rounded inner corners and bowed edges. */
function line(pts: P[], r = 5, bow = 1.6): string {
  if (pts.length === 2) return `M ${pt(pts[0])} ${edge(pts[0], pts[1], bow)}`;
  let d = `M ${pt(pts[0])}`;
  let from = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b] = cut(pts[i - 1], pts[i], pts[i + 1], r);
    d += ` ${edge(from, a, bow)} ${corner(a, pts[i], b)}`;
    from = b;
  }
  return `${d} ${edge(from, pts[pts.length - 1], bow)}`;
}

const rect = (x1: number, y1: number, x2: number, y2: number, r = 7) =>
  poly(
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ],
    r,
  );

/** A stadium (chain link) of length `len` and width `w`, rotated `deg`. */
function link(cx: number, cy: number, len: number, w: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const h = len / 2;
  const q = w / 2;
  const at = (s: number, t: number): P => [cx + ux * s - uy * t, cy + uy * s + ux * t];
  const k = q * 0.55;
  const s = h - q; // straight half-length
  // Clockwise: top straight, right cap, bottom straight, left cap.
  return [
    `M ${pt(at(-s, -q))}`,
    edge(at(-s, -q), at(s, -q), 1.2),
    `C ${pt(at(s + k, -q))} ${pt(at(h, -k))} ${pt(at(h, 0))}`,
    `C ${pt(at(h, k))} ${pt(at(s + k, q))} ${pt(at(s, q))}`,
    edge(at(s, q), at(-s, q), 1.2),
    `C ${pt(at(-s - k, q))} ${pt(at(-h, k))} ${pt(at(-h, 0))}`,
    `C ${pt(at(-h, -k))} ${pt(at(-s - k, -q))} ${pt(at(-s, -q))}`,
    'Z',
  ].join(' ');
}

/** A gear: `teeth` teeth between radius `ri` and `ro`. */
function gear(cx: number, cy: number, teeth: number, ri: number, ro: number): string {
  const at = (deg: number, r: number): P => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const step = 360 / teeth;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const c = i * step;
    const b0 = at(c - step * 0.3, ri);
    const t0 = at(c - step * 0.17, ro);
    const t1 = at(c + step * 0.17, ro);
    const b1 = at(c + step * 0.3, ri);
    const nb = at(c + step * 0.7, ri);
    if (i === 0) parts.push(`M ${pt(b0)}`);
    parts.push(edge(b0, t0, 1.3), edge(t0, t1, 1.6), edge(t1, b1, 1.3), edge(b1, nb, 1.6));
  }
  return `${parts.join(' ')} Z`;
}

export const BATCH_C = {
  trash: {
    name: 'Delete',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Delete or remove an item permanently.',
    f: [
      [
        poly([
          [28, 34, 3],
          [72, 34, 3],
          [67, 82],
          [33, 82],
        ]),
        'T',
      ],
    ],
    l: [
      line([
        [20, 28],
        [80, 28],
      ]),
      line(
        [
          [40, 26],
          [42, 17],
          [58, 17],
          [60, 26],
        ],
        4,
      ),
      line([
        [43, 46],
        [44, 70],
      ]),
      line([
        [57, 46],
        [56, 70],
      ]),
    ],
  },

  edit: {
    name: 'Edit',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Edit, rename or write into a field.',
    f: [
      [
        poly(
          [
            [18, 82, 2],
            [25, 60, 1],
            [64, 21, 7],
            [79, 36, 7],
            [40, 75, 1],
          ],
          6,
        ),
        'T',
      ],
    ],
    l: [
      line([
        [25, 60],
        [40, 75],
      ]),
      line([
        [55, 30],
        [70, 45],
      ]),
    ],
  },

  copy: {
    name: 'Copy',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Copy text or duplicate an item.',
    f: [
      [rect(18, 18, 58, 58, 8), 'P'],
      [rect(40, 40, 82, 82, 8), 'T'],
    ],
  },

  save: {
    name: 'Save',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Save changes to a record or draft.',
    f: [
      [
        poly([
          [20, 20],
          [66, 20, 3],
          [80, 34, 3],
          [80, 80],
          [20, 80],
        ]),
        'T',
      ],
      [rect(32, 20, 62, 40, 3), 'P'],
      [rect(30, 54, 70, 80, 4), 'P'],
    ],
  },

  download: {
    name: 'Download',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Download or export a file.',
    f: [
      [
        poly(
          [
            [42, 14],
            [58, 14],
            [58, 40],
            [72, 40],
            [50, 64],
            [28, 40],
            [42, 40],
          ],
          3,
        ),
        'T',
      ],
    ],
    l: [
      line([
        [18, 62],
        [20, 82],
        [80, 82],
        [82, 62],
      ]),
    ],
  },

  upload: {
    name: 'Upload',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Upload or import a file.',
    f: [
      [
        poly(
          [
            [50, 14],
            [72, 38],
            [58, 38],
            [58, 64],
            [42, 64],
            [42, 38],
            [28, 38],
          ],
          3,
        ),
        'T',
      ],
    ],
    l: [
      line([
        [18, 62],
        [20, 82],
        [80, 82],
        [82, 62],
      ]),
    ],
  },

  link: {
    name: 'Link',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Hyperlinks and connecting two records.',
    l: tinted(`${link(36, 64, 44, 24, -45)} ${link(64, 36, 44, 24, -45)}`),
  },

  unlink: {
    name: 'Unlink',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Remove a link or disconnect an integration.',
    l: [
      ...tinted(`${link(31, 69, 36, 24, -45)} ${link(69, 31, 36, 24, -45)}`),
      line([
        [44, 22],
        [46, 32],
      ]),
      line([
        [78, 54],
        [68, 56],
      ]),
    ],
  },

  send: {
    name: 'Send',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Send a message, invite or form.',
    f: [
      [
        poly(
          [
            [16, 46],
            [84, 16, 3],
            [58, 84],
            [46, 56, 2],
          ],
          5,
        ),
        'T',
      ],
    ],
    l: [
      line([
        [46, 56],
        [82, 18],
      ]),
    ],
  },

  mail: {
    name: 'Mail',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Email addresses, mail and newsletters.',
    f: [[rect(14, 24, 86, 76, 8), 'T']],
    l: [
      line(
        [
          [18, 30],
          [50, 54],
          [82, 30],
        ],
        4,
      ),
    ],
  },

  inbox: {
    name: 'Inbox',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Incoming items waiting for a decision.',
    f: [
      [rect(16, 20, 84, 80, 8), 'T'],
      [
        poly(
          [
            [24, 28],
            [76, 28],
            [76, 56, 1],
            [62, 56, 3],
            [58, 64, 3],
            [42, 64, 3],
            [38, 56, 3],
            [24, 56, 1],
          ],
          4,
        ),
        'P',
      ],
    ],
  },

  archive: {
    name: 'Archive',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Archive or restore an item.',
    f: [
      [rect(22, 38, 78, 82, 6), 'T'],
      [rect(14, 20, 86, 40, 6), 'T'],
    ],
    l: [
      line([
        [41, 54],
        [59, 54],
      ]),
    ],
  },

  bookmark: {
    name: 'Bookmark',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Bookmark something to come back to.',
    f: [
      [
        poly([
          [28, 16, 7],
          [72, 16, 7],
          [72, 84, 2],
          [50, 66, 3],
          [28, 84, 2],
        ]),
        'T',
      ],
    ],
  },

  tag: {
    name: 'Tag',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Tags, labels and categories.',
    f: [
      [
        poly(
          [
            [16, 16, 8],
            [48, 16, 3],
            [84, 52, 6],
            [52, 84, 6],
            [16, 48, 3],
          ],
          6,
        ),
        'T',
      ],
      [ring(34, 34, 8), 'P'],
    ],
  },

  pushpin: {
    name: 'Pushpin',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Pin an item to the top of a list.',
    f: [
      [
        poly(
          [
            [32, 14, 4],
            [68, 14, 4],
            [62, 26, 1],
            [62, 40, 2],
            [76, 54, 3],
            [76, 60, 3],
            [24, 60, 3],
            [24, 54, 3],
            [38, 40, 2],
            [38, 26, 1],
          ],
          3,
        ),
        'T',
      ],
    ],
    l: ['M 50 60 C 51.5 68 48.5 78 50 88'],
  },

  // The most-used icon after close and check. A pin with a paper hole, and a
  // ground line under its point so it reads as STANDING on a place rather than
  // floating — the thing that separates it from `near-you` at a glance.
  pin: {
    name: 'Location pin',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'An address, location or place on a map.',
    f: [
      [
        'M 50 78 C 36 63 26 52 26 39 C 26 25 37 14 50 14 C 63 14 74 25 74 39 C 74 52 64 63 50 78 Z',
        'T',
      ],
      [ring(50, 39, 9), 'P'],
    ],
    l: ['M 28 85 C 36 88 42 87 46 86', 'M 54 86 C 58 87 64 88 72 85'],
  },

  image: {
    name: 'Image',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Photos, images and media galleries.',
    f: [
      [rect(14, 20, 86, 80, 8), 'P'],
      [
        'M 15 70 C 24 60 32 50 38 46 C 44 50 48 55 52 60 C 56 56 60 52 64 50 C 72 56 79 63 85 70 C 85 75 82 79 77 79 C 59 80 41 80 23 79 C 18 79 15 75 15 70 Z',
        'T',
      ],
    ],
    l: [ring(64, 36, 4)],
  },

  layers: {
    name: 'Layers',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Map layers and stacked overlays.',
    f: [
      [
        poly(
          [
            [50, 14],
            [84, 32],
            [50, 50],
            [16, 32],
          ],
          4,
        ),
        'T',
      ],
    ],
    l: [
      line(
        [
          [16, 50],
          [50, 68],
          [84, 50],
        ],
        4,
      ),
      line(
        [
          [16, 66],
          [50, 84],
          [84, 66],
        ],
        4,
      ),
    ],
  },

  grid: {
    name: 'Grid view',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Grid, table and dashboard layouts.',
    f: [
      [rect(16, 16, 44, 44, 6), 'T'],
      [rect(56, 16, 84, 44, 6), 'T'],
      [rect(16, 56, 44, 84, 6), 'T'],
      [rect(56, 56, 84, 84, 6), 'T'],
    ],
  },

  list: {
    name: 'List view',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'List and row layouts.',
    f: [
      [ring(24, 26, 8), 'T'],
      [ring(24, 50, 8), 'T'],
      [ring(24, 74, 8), 'T'],
    ],
    l: [
      line([
        [42, 26],
        [84, 26],
      ]),
      line([
        [42, 50],
        [84, 50],
      ]),
      line([
        [42, 74],
        [84, 74],
      ]),
    ],
  },

  // No numerals (§7.5), so order is drawn the way this family draws it: stations
  // on one line. Three bullets joined by a track read as a sequence.
  'list-ordered': {
    name: 'Numbered list',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Ordered steps, rankings and sequences.',
    l: [
      'M 24 26 C 22.5 42 25.5 58 24 74',
      line([
        [42, 26],
        [84, 26],
      ]),
      line([
        [42, 50],
        [84, 50],
      ]),
      line([
        [42, 74],
        [84, 74],
      ]),
    ],
    f: [
      [ring(24, 26, 8), 'T'],
      [ring(24, 50, 8), 'T'],
      [ring(24, 74, 8), 'T'],
    ],
  },

  box: {
    name: 'Package',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Packages, modules and bundled items.',
    f: [
      [
        poly(
          [
            [50, 14],
            [84, 31],
            [84, 69],
            [50, 86],
            [16, 69],
            [16, 31],
          ],
          4,
        ),
        'T',
      ],
      [
        poly(
          [
            [50, 14],
            [84, 31],
            [50, 48],
            [16, 31],
          ],
          4,
        ),
        'P',
      ],
    ],
    l: ['M 50 48 C 51.5 60 48.5 72 50 86'],
  },

  database: {
    name: 'Database',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Databases, servers and data stores.',
    f: [
      [
        'M 20 26 C 20 18 34 14 50 14 C 66 14 80 18 80 26 C 81 42 81 58 80 74 C 80 82 66 86 50 86 C 34 86 20 82 20 74 C 19 58 19 42 20 26 Z',
        'T',
      ],
      [
        'M 20 26 C 20 18 34 14 50 14 C 66 14 80 18 80 26 C 80 34 66 38 50 38 C 34 38 20 34 20 26 Z',
        'P',
      ],
    ],
    l: [
      'M 20 46 C 20 54 34 58 50 58 C 66 58 80 54 80 46',
      'M 20 62 C 20 70 34 74 50 74 C 66 74 80 70 80 62',
    ],
  },

  keyboard: {
    name: 'Keyboard',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Keyboard shortcuts and command menus.',
    f: [[rect(14, 26, 86, 74, 9), 'T']],
    l: [
      `${ring(28, 40, 2)} ${ring(44, 40, 2)} ${ring(60, 40, 2)} ${ring(74, 40, 2)}`,
      line([
        [32, 59],
        [68, 59],
      ]),
    ],
  },

  code: {
    name: 'Code',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Code, embeds and developer tools.',
    l: [
      ...colored(
        `${line(
          [
            [34, 28],
            [16, 50],
            [34, 72],
          ],
          4,
        )} ${line(
          [
            [66, 28],
            [84, 50],
            [66, 72],
          ],
          4,
        )}`,
      ),
      line([
        [57, 22],
        [43, 78],
      ]),
    ],
  },

  settings: {
    name: 'Settings',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Settings, preferences and configuration.',
    f: [
      [gear(50, 50, 8, 26, 36), 'T'],
      [ring(50, 50, 10), 'P'],
    ],
  },
} satisfies Record<string, IconDef>;

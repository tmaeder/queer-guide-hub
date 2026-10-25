import { C, G, M, Y, flipX, ring, tinted, type IconDef } from '../iconKit';

/** Icon System v2 — batch g of the interface set that replaced lucide-react.
 *  Tools, the rich-text editor toolbar, money and health. */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A "straight" run: a cubic whose control points sit `b` units off the chord,
 *  because §4 forbids a flat segment and letter stems are mostly flat runs. */
function seg(x1: number, y1: number, x2: number, y2: number, b = 1.8): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * b;
  const ny = (dx / len) * b;
  return `C ${r1(x1 + dx / 3 + nx)} ${r1(y1 + dy / 3 + ny)} ${r1(x1 + (2 * dx) / 3 + nx)} ${r1(y1 + (2 * dy) / 3 + ny)} ${x2} ${y2}`;
}
const line = (x1: number, y1: number, x2: number, y2: number, b?: number) =>
  `M ${x1} ${y1} ${seg(x1, y1, x2, y2, b)}`;

/** Map every coordinate pair of an absolute M/C/Z path through `f`. */
const xf = (f: (x: number, y: number) => [number, number], d: string) =>
  d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, a, b) => {
    const [x, y] = f(Number(a), Number(b));
    return `${r1(x)} ${r1(y)}`;
  });
/** Local (along, across) axes on the rising 45° diagonal, centred on cx,cy. */
const diag =
  (cx: number, cy: number) =>
  (a: number, b: number): [number, number] => [cx + 0.707 * (a + b), cy + 0.707 * (b - a)];
const shift = (dx: number, d: string) => xf((x, y) => [x + dx, y], d);

// Editor glyphs share one weight; `bold` is the only letter drawn heavier,
// because that weight IS what it means.
const letter = (d: string) => tinted(d);

const H = `${line(18, 24, 18, 76)} ${line(42, 24, 42, 76)} ${line(18, 50, 42, 50)}`;

const BOLD_B =
  'M 32 22 C 30.5 40 30.5 60 32 78 C 46 79 70 80 70 63 C 70 50 58 49 34 49 C 52 49 64 46 64 34 C 64 20 46 21 32 22';

const ALIGN_ROWS = [26, 50, 74];
const align = (spans: [number, number][]) =>
  letter(spans.map(([x1, x2], i) => line(x1, ALIGN_ROWS[i], x2, ALIGN_ROWS[i])).join(' '));

const pillAxis = diag(50, 50);
const syringeAxis = diag(50, 50);
const markerAxis = diag(54, 44);

const quoteMark =
  'M 22 56 C 22 40 30 30 44 24 C 46.5 26 46.5 28 46 30 C 38 34 34 40 34 46 C 42 46 46 52 46 58 C 46 66 40 72 34 72 C 26 72 22 64 22 56 Z';

const bugLegs = [
  'M 31 50 C 25 49 21 46 17 42',
  'M 30 62 C 25 61.5 20 62.5 15 64',
  'M 32 72 C 26 74 22 78 19 82',
  'M 45 25 C 42 21 38 18 33 16',
];

export const BATCH_G = {
  // ── Tools ────────────────────────────────────────────────────────────────
  // A spine with one branch peeling off it — the git-branch shape. The near
  // miss is `share` (three loose nodes); the straight spine is what separates.
  workflow: {
    name: 'Workflow',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Pipelines, workflows, branches and trees.',
    f: [
      [ring(30, 24, 9), 'T'],
      [ring(30, 76, 9), 'T'],
      [ring(70, 32, 9), 'T'],
    ],
    l: [line(30, 33, 30, 67), 'M 70 41 C 70 56 56 60 38 67'],
  },

  // Two lines arriving into one: a symmetric Y, so it cannot be read as the
  // one-sided `workflow` branch.
  merge: {
    name: 'Merge',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Merge records, branches or duplicates into one.',
    f: [
      [ring(28, 24, 9), 'T'],
      [ring(72, 24, 9), 'T'],
      [ring(50, 76, 9), 'T'],
    ],
    l: ['M 28 33 C 29 46 49 46 50 58 C 51 46 71 46 72 33', line(50, 58, 50, 67)],
  },

  compare: {
    name: 'Compare',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Compare two versions side by side.',
    f: [
      [ring(28, 28, 9), 'T'],
      [ring(72, 72, 9), 'T'],
    ],
    l: [
      `M 28 37 C 27 50 28 66 46 72 M 39 63 ${seg(39, 63, 46, 72)} ${seg(46, 72, 38, 80)}`,
      `M 72 63 C 73 50 72 34 54 28 M 61 37 ${seg(61, 37, 54, 28)} ${seg(54, 28, 62, 20)}`,
    ],
  },

  hash: {
    name: 'Hash',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Hashtags, IDs and numbered references.',
    l: letter(
      `${line(42, 20, 34, 80)} ${line(66, 20, 58, 80)} ${line(22, 38, 80, 38)} ${line(20, 62, 78, 62)}`,
    ),
  },

  bug: {
    name: 'Bug Report',
    group: 'Signals',
    hex: M,
    t: 'none',
    use: 'Report a bug or a broken page.',
    f: [
      ['M 38 38 C 38 29 43 24 50 24 C 57 24 62 29 62 38 Z', 'T'],
      [
        'M 50 34 C 64 34 70 46 70 58 C 70 72 62 82 50 82 C 38 82 30 72 30 58 C 30 46 36 34 50 34 Z',
        'T',
      ],
    ],
    l: [line(50, 40, 50, 80), ...bugLegs, ...bugLegs.map(flipX)],
  },

  rocket: {
    name: 'Launch',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Launch, publish or deploy something new.',
    f: [
      ['M 38 50 C 29 54 25 62 25 72 C 30 68 34 66 38 66 Z', 'T'],
      ['M 62 50 C 71 54 75 62 75 72 C 70 68 66 66 62 66 Z', 'T'],
      ['M 50 16 C 62 24 66 40 63 64 C 55 66 45 66 37 64 C 34 40 38 24 50 16 Z', 'T'],
      [ring(50, 38, 8), 'P'],
    ],
    l: ['M 50 70 C 48.5 75 51.5 80 50 85'],
  },

  plug: {
    name: 'Power Plug',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Integrations, webhooks, power and connections.',
    f: [
      [
        'M 28 32 C 42 30 58 30 72 32 C 73 42 72 50 66 56 C 60 62 40 62 34 56 C 28 50 27 42 28 32 Z',
        'T',
      ],
    ],
    l: [line(40, 16, 40, 31), line(60, 16, 60, 31), 'M 50 61 C 48.5 70 52 76 50 86'],
  },

  palette: {
    name: 'Palette',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Design, theming, colour and appearance settings.',
    f: [
      [
        'M 50 18 C 30 18 16 32 16 50 C 16 68 30 82 48 82 C 56 82 58 76 56 70 C 54 64 58 60 64 60 C 72 60 84 62 84 48 C 84 30 70 18 50 18 Z',
        'T',
      ],
    ],
    l: [`${ring(31, 48, 3.5)} ${ring(46, 31, 3.5)} ${ring(67, 38, 3.5)}`],
  },

  // ── Money ────────────────────────────────────────────────────────────────
  money: {
    name: 'Money',
    group: 'Market',
    hex: Y,
    t: 'none',
    use: 'Prices, payments, wallets and funding.',
    f: [
      [
        'M 15 30 C 38 28 62 28 85 30 C 86.5 43 86.5 57 85 70 C 62 72 38 72 15 70 C 13.5 57 13.5 43 15 30 Z',
        'T',
      ],
      [ring(50, 50, 10), 'P'],
    ],
    l: [`${ring(27, 50, 3)} ${ring(73, 50, 3)}`],
  },

  // ── Health ───────────────────────────────────────────────────────────────
  // Half coloured, half paper, and no roundel — the roundel-and-capsule is
  // `harm-reduction`, and this must not be read as that.
  pill: {
    name: 'Pill',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Medication, prescriptions and PrEP.',
    f: [
      [
        xf(
          pillAxis,
          'M -22 -14 C -8 -15.5 8 -15.5 22 -14 C 29.7 -14 36 -7.7 36 0 C 36 7.7 29.7 14 22 14 C 8 15.5 -8 15.5 -22 14 C -29.7 14 -36 7.7 -36 0 C -36 -7.7 -29.7 -14 -22 -14 Z',
        ),
        'P',
      ],
      [
        xf(
          pillAxis,
          'M 0 -15 C -8 -16.5 -15 -16.5 -22 -14 C -29.7 -14 -36 -7.7 -36 0 C -36 7.7 -29.7 14 -22 14 C -15 16.5 -8 16.5 0 15 C 1.5 5 1.5 -5 0 -15 Z',
        ),
        'T',
      ],
    ],
  },

  syringe: {
    name: 'Syringe',
    group: 'Safety',
    hex: G,
    t: 'none',
    use: 'Needle exchange, vaccines and safer injecting.',
    f: [
      [
        xf(
          syringeAxis,
          'M -16 -11 C -4 -12.5 8 -12.5 20 -11 C 21.5 -4 21.5 4 20 11 C 8 12.5 -4 12.5 -16 11 C -17.5 4 -17.5 -4 -16 -11 Z',
        ),
        'T',
      ],
    ],
    l: [
      xf(syringeAxis, 'M 20 -19 C 21.5 -6 21.5 6 20 19'),
      xf(syringeAxis, 'M 21 0 C 26 1.5 31 1.5 35 0'),
      xf(syringeAxis, 'M 35 -10 C 36.5 -3 36.5 3 35 10'),
      xf(syringeAxis, 'M -17 0 C -26 1.5 -34 1.5 -40 0'),
    ],
  },

  'test-tube': {
    name: 'Test Tube',
    group: 'Safety',
    hex: C,
    t: 'none',
    use: 'Testing, lab results and research.',
    f: [
      [
        'M 36 18 C 37.5 40 37.5 58 36 68 C 36 78 42 84 50 84 C 58 84 64 78 64 68 C 62.5 58 62.5 40 64 18 C 55 19.5 45 19.5 36 18 Z',
        'P',
      ],
      [
        'M 37 50 C 46 48 54 52 63 50 C 64.5 56 65.5 62 64 68 C 64 78 58 84 50 84 C 42 84 36 78 36 68 C 34.5 62 35.5 56 37 50 Z',
        'T',
      ],
    ],
    l: [line(28, 18, 72, 18)],
  },

  // ── Rich-text editor ─────────────────────────────────────────────────────
  bold: {
    name: 'Bold Text',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: make the selection bold.',
    l: [
      [BOLD_B, null, 1.3],
      [BOLD_B, 'T', 0.6],
    ],
  },

  italic: {
    name: 'Italic Text',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: make the selection italic.',
    l: letter(`${line(58, 22, 42, 78)} ${line(46, 22, 70, 22)} ${line(30, 78, 54, 78)}`),
  },

  underline: {
    name: 'Underline Text',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: underline the selection.',
    l: letter(
      `M 32 16 C 30.5 30 30.5 40 32 48 C 34 58 42 62 50 62 C 58 62 66 58 68 48 C 69.5 40 69.5 30 68 16 ${line(24, 82, 76, 82)}`,
    ),
  },

  strikethrough: {
    name: 'Strikethrough',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: strike through the selection.',
    l: letter(
      `M 68 28 C 62 18 36 16 34 31 C 32 44 68 50 66 66 C 64 82 38 82 30 72 ${line(18, 50, 82, 50)}`,
    ),
  },

  'heading-1': {
    name: 'Heading One',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: format as a level-one heading.',
    l: letter(`${H} M 60 46 C 65 44 69 41 72 36 ${seg(72, 36, 72, 78)}`),
  },

  'heading-2': {
    name: 'Heading Two',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: format as a level-two heading.',
    l: letter(
      `${H} M 58 46 C 60 39 65 36 70 36 C 77 36 82 40 82 47 C 82 57 66 64 58 78 ${seg(58, 78, 84, 78)}`,
    ),
  },

  'heading-3': {
    name: 'Heading Three',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: format as a level-three heading.',
    l: letter(
      `${H} M 58 40 C 64 34 81 33 81 45 C 81 52 75 55 68 55 C 76 55 83 59 83 67 C 83 80 66 81 58 74`,
    ),
  },

  'heading-4': {
    name: 'Heading Four',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: format as a level-four heading.',
    l: letter(
      `${H} M 76 78 C 77.5 64 77.5 50 76 36 ${seg(76, 36, 56, 65)} ${seg(56, 65, 84, 65)}`,
    ),
  },

  quote: {
    name: 'Quote Block',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: format as a block quote.',
    f: [
      [quoteMark, 'T'],
      [shift(32, quoteMark), 'T'],
    ],
  },

  // Three rows, not lucide's four: at 16px a four-row stack leaves under one
  // pixel between strokes. The middle row is the short one so the centred
  // variant can never read as `filter`'s narrowing funnel.
  'align-left': {
    name: 'Align Left',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: align text to the left.',
    l: align([
      [18, 82],
      [18, 54],
      [18, 70],
    ]),
  },

  'align-center': {
    name: 'Align Center',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: centre the text.',
    l: align([
      [18, 82],
      [34, 66],
      [26, 74],
    ]),
  },

  'align-right': {
    name: 'Align Right',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Editor toolbar: align text to the right.',
    l: align([
      [18, 82],
      [46, 82],
      [30, 82],
    ]),
  },

  highlighter: {
    name: 'Highlighter',
    group: 'Actions',
    hex: Y,
    t: 'none',
    use: 'Editor toolbar: highlight the selection.',
    f: [
      [
        'M 18 72 C 34 70.5 50 70.5 66 72 C 67.5 76 67.5 80 66 84 C 50 85.5 34 85.5 18 84 C 16.5 80 16.5 76 18 72 Z',
        'T',
      ],
      [
        xf(
          markerAxis,
          'M 0 -11 C 10 -12.5 20 -12.5 30 -11 C 31.5 -4 31.5 4 30 11 C 20 12.5 10 12.5 0 11 C -1.5 4 -1.5 -4 0 -11 Z',
        ),
        'P',
      ],
      [
        xf(
          markerAxis,
          'M 0 -11 C -4 -11.5 -8 -9.5 -12 -6 C -13.5 -2 -13.5 2 -12 6 C -8 9.5 -4 11.5 0 11 C 1.5 4 1.5 -4 0 -11 Z',
        ),
        'T',
      ],
    ],
  },
} satisfies Record<string, IconDef>;

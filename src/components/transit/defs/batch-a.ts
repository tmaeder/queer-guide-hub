import { C, G, M, flipX, ring, rot, tinted, type IconDef } from '../iconKit';

/** Icon System v2 — batch a of the interface set that replaced lucide-react.
 *
 *  Interface chrome: drawn as `tinted` line art (ink casing, colour core) at
 *  the base weight, so a 16px chevron weighs the same as `filter` or `share`
 *  beside it. Directional families come from ONE master each through `rot`,
 *  so the four arrows and four chevrons cannot drift apart. */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A right-pointing arrowhead with its tip at (tx, ty), half-height `s`.
 *  Both arms bow outward ~1.5 units, which keeps them off the chord. */
function head(tx: number, ty: number, s: number): string {
  const p = (dx: number, dy: number) => `${r1(tx - dx * s)} ${r1(ty + dy * s)}`;
  return `M ${p(0.9, -1)} C ${p(0.52, -0.8)} ${p(0.2, -0.38)} ${p(0, 0)} C ${p(0.2, 0.38)} ${p(0.52, 0.8)} ${p(0.9, 1)}`;
}

/** The master arrow, pointing right. */
const ARROW = `M 18 50 C 36 48 56 52 80 50 ${head(80, 50, 18)}`;

/** The master chevron, pointing right. */
const CHEVRON = 'M 38 24 C 50 34 58 42 64 50 C 58 58 50 66 38 76';

/** A short horizontal arrow for paired glyphs (swap). */
const SHORT = `M 20 34 C 38 32 56 36 76 34 ${head(78, 34, 13)}`;

/** Sign-in / sign-out door: a bracket open to the left. */
const DOOR =
  'M 58 22 C 64 21 70 21 74 22 C 78 22 80 24 80 28 C 81.5 42 81.5 58 80 72 C 80 76 78 78 74 78 C 70 79 64 79 58 78';

/** A tinted magnifier lens, the handle in ink like `search`. */
const LENS = [...tinted(ring(44, 44, 25)), 'M 63 63 C 68 71 74 77 82 82'];

export const BATCH_A = {
  close: {
    name: 'Close',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Dismiss a dialog, sheet, chip or banner.',
    l: tinted('M 27 27 C 39 41 59 61 73 73 M 73 27 C 61 41 41 61 27 73'),
  },

  check: {
    name: 'Check',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Done, selected, confirmed or copied.',
    l: tinted('M 22 52 C 30 58 36 66 42 72 C 52 56 64 40 80 28'),
  },

  plus: {
    name: 'Plus',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Add an item, file, date or reaction.',
    l: tinted('M 50 22 C 48.5 40 48.5 60 50 78 M 22 50 C 40 51.5 60 51.5 78 50'),
  },

  minus: {
    name: 'Minus',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Remove one, decrease or collapse.',
    l: tinted('M 22 50 C 40 52 60 48 78 50'),
  },

  'arrow-right': {
    name: 'Arrow Right',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Continue, next step or go to.',
    l: tinted(ARROW),
  },

  'arrow-left': {
    name: 'Arrow Left',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Go back or previous step.',
    l: tinted(rot(ARROW, 2)),
  },

  'arrow-up': {
    name: 'Arrow Up',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Move up, back to top or upload.',
    l: tinted(rot(ARROW, 3)),
  },

  'arrow-down': {
    name: 'Arrow Down',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Move down, scroll on or download.',
    l: tinted(rot(ARROW, 1)),
  },

  'chevron-down': {
    name: 'Chevron Down',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Open a menu, select or accordion.',
    l: tinted(rot(CHEVRON, 1)),
  },

  'chevron-up': {
    name: 'Chevron Up',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Collapse an open section.',
    l: tinted(rot(CHEVRON, 3)),
  },

  'chevron-left': {
    name: 'Chevron Left',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Previous page, slide or month.',
    l: tinted(rot(CHEVRON, 2)),
  },

  'chevron-right': {
    name: 'Chevron Right',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Next page, slide, or drill into a row.',
    l: tinted(CHEVRON),
  },

  // Two chevrons pointing apart: the select/sort affordance, not an arrow.
  sort: {
    name: 'Sort',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Change sort order or open a sorted select.',
    l: tinted(
      'M 30 40 C 38 31 44 25 50 22 C 56 25 62 31 70 40 M 30 60 C 38 69 44 75 50 78 C 56 75 62 69 70 60',
    ),
  },

  swap: {
    name: 'Swap',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Swap two values, reverse or shuffle.',
    l: tinted(`${SHORT} ${rot(SHORT, 2)}`),
  },

  'sub-item': {
    name: 'Sub Item',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'A nested reply, child row or indented item.',
    l: tinted(`M 28 20 C 26 36 26 50 30 58 C 34 66 46 68 76 66 ${head(78, 66, 14)}`),
  },

  reply: {
    name: 'Reply',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Reply to a message or comment.',
    l: tinted(`M 80 76 C 78 56 66 46 46 46 C 36 44.5 28 47.5 22 46 ${flipX(head(78, 46, 16))}`),
  },

  // Open box, arrow leaving through the gap at the top right.
  external: {
    name: 'External Link',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Opens off-site or in a new tab.',
    l: [
      'M 46 24 C 38 23 32 23 28 24 C 25 24 23 26 23 30 C 22 46 22 62 23 72 C 23 75 25 77 28 77 C 40 78 56 78 70 77 C 73 77 76 75 76 72 C 77 66 77 60 76 54',
      ...tinted('M 46 54 C 58 44 68 34 78 22 M 56 22 C 64 20.5 72 20.5 78 22 C 79.5 28 79.5 36 78 44'),
    ],
  },

  // Three tinted dots, the same mark as `grip`, spaced so they stay apart at 16px.
  more: {
    name: 'More',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Overflow menu with more actions.',
    l: tinted(`${ring(25, 50, 4.5)} ${ring(50, 50, 4.5)} ${ring(75, 50, 4.5)}`),
  },

  menu: {
    name: 'Menu',
    group: 'Wayfinding',
    hex: C,
    t: 'none',
    use: 'Open the main navigation menu.',
    l: tinted('M 22 28 C 40 26 60 30 78 28 M 22 50 C 40 48 60 52 78 50 M 22 72 C 40 70 60 74 78 72'),
  },

  panel: {
    name: 'Side Panel',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Open or close a sidebar panel.',
    f: [
      [
        'M 30 22 C 46 20.5 62 20.5 70 22 C 78 22 82 26 82 34 C 83.5 46 83.5 54 82 66 C 82 74 78 78 70 78 C 62 79.5 46 79.5 30 78 C 22 78 18 74 18 66 C 16.5 54 16.5 46 18 34 C 18 26 22 22 30 22 Z',
        'P',
      ],
      [
        'M 30 22 C 34 20.5 38 20.5 42 22 C 43.5 40 43.5 60 42 78 C 38 79.5 34 79.5 30 78 C 22 78 18 74 18 66 C 16.5 54 16.5 46 18 34 C 18 26 22 22 30 22 Z',
        'T',
      ],
    ],
  },

  grip: {
    name: 'Grip',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Drag handle to reorder or move.',
    l: tinted(
      [37, 63]
        .flatMap((x) => [26, 50, 74].map((y) => ring(x, y, 4.5)))
        .join(' '),
    ),
  },

  'zoom-in': {
    name: 'Zoom In',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Zoom in, enlarge or go full screen.',
    l: [...LENS, 'M 44 35 C 43 40 43 48 44 53 M 35 44 C 40 43 48 43 53 44'],
  },

  'zoom-out': {
    name: 'Zoom Out',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Zoom out or shrink the view.',
    l: [...LENS, 'M 35 44 C 40 45 48 43 53 44'],
  },

  pointer: {
    name: 'Pointer',
    group: 'Actions',
    hex: C,
    t: 'none',
    use: 'Click here, tap target or select.',
    f: [
      [
        'M 30 18 C 28.5 36 28.5 54 30 72 C 35 69 40 64 43.6 58.8 C 45 67 49 76 53.8 82.6 C 56 83.5 58.8 82 60.6 79.2 C 59 71 55 62 50.4 55.4 C 56 54 62 54.5 67.4 55.4 C 56 42 43 29 30 18 Z',
        'T',
      ],
    ],
  },

  'log-in': {
    name: 'Log In',
    group: 'Actions',
    hex: G,
    t: 'none',
    use: 'Sign in to an account.',
    l: tinted(`${DOOR} M 16 50 C 28 48 40 52 58 50 ${head(60, 50, 14)}`),
  },

  'log-out': {
    name: 'Log Out',
    group: 'Actions',
    hex: M,
    t: 'none',
    use: 'Sign out of the account.',
    l: tinted(`${flipX(DOOR)} M 42 50 C 56 48 70 52 82 50 ${head(84, 50, 14)}`),
  },
} satisfies Record<string, IconDef>;

import { ring, type IconDef, type Stroke } from './iconKit';
import type { TransitIconName } from './transitIconPaths';

/** Below 40 rendered pixels, details need their own drawing, not more weight.
 * Keep silhouettes and track fills; open up counters and crowded intersections.
 * Large illustrations continue to use the original artwork verbatim. */
const DETAILS: Partial<Record<TransitIconName, Pick<IconDef, 'f' | 'l'>>> = {
  chat: { l: [`${ring(32, 45, 1)} ${ring(50, 45, 1)} ${ring(68, 45, 1)}`] },
  health: {
    l: [
      'M 28 50 C 33 49 36 51 39 50 C 42 43 43 39 45 36 C 48 48 51 57 54 62 C 57 56 59 52 62 50 C 65 49 68 51 72 50',
    ],
  },
  tune: {
    // Break the rails around the knobs rather than drawing through them.
    f: [
      [ring(38, 35, 9), 'T'],
      [ring(64, 65, 9), 'T'],
    ],
    l: [
      'M 20 35 C 23 34 26 34 29 35 M 47 35 C 58 34 69 36 80 35 M 20 65 C 32 64 44 66 55 65 M 73 65 C 76 64 78 64 80 65',
    ],
  },
  compass: {
    f: [
      [ring(50, 50, 34), 'T'],
      ['M 64 34 C 60 46 54 57 36 66 C 40 54 46 43 64 34 Z', 'P'],
    ],
  },
  'info-point': {
    l: [`${ring(50, 31, 1)} M 50 47 C 49 54 49 61 50 68`],
  },
  disco: {
    l: ['M 50 20 C 41 36 41 60 50 76 M 23 48 C 40 50 60 50 77 48 M 50 12 C 49 14 49 17 50 20'],
  },
  theater: {
    l: ['M 34 44 C 37 42 40 42 43 44 M 57 44 C 60 42 63 42 66 44 M 38 58 C 44 67 56 67 62 58'],
  },
};

/** Collapse casing/core pairs to one clear outline. At 16px a coloured core
 * leaves less than half a pixel of casing on each side, which blurs the edge.
 * Track colour remains in filled silhouettes; small linework follows text. */
export function compactIcon(name: TransitIconName, original: IconDef): IconDef {
  const details = DETAILS[name];
  const def = { ...original, ...details };
  if (name === 'events') {
    def.f = [original.f![0], [ring(50, 56, 11), 'P']];
    def.l = original.l;
  }
  const inkPaths = new Set(
    def.l?.flatMap((s) => (typeof s === 'string' ? [s] : s[1] === null ? [s[0]] : [])),
  );
  return {
    ...def,
    l: def.l
      ?.filter((s) => typeof s === 'string' || s[1] === null || s[1] === 'P' || !inkPaths.has(s[0]))
      .map((stroke): Stroke => {
        if (typeof stroke === 'string') return stroke;
        const [d, color, weight] = stroke;
        return [d, color, Math.min(weight, 1)];
      }),
  };
}

export const COMPACT_ICON_LIMIT = 40;
/** 1.5px at 20px, 1.8px at 24px; enough room for colour and open counters. */
export const COMPACT_STROKE_WIDTH = 7.5;

/**
 * WCAG 2.x contrast math for HSL channel triples ("H S% L%") as used by the
 * design tokens in src/index.css. Pure functions, no DOM.
 */

export type ContrastVerdict = {
  ratio: number;
  aa: boolean; // ≥ 4.5:1 (normal text)
  aaLarge: boolean; // ≥ 3:1 (large text / UI components)
  aaa: boolean; // ≥ 7:1
};

/** Parse "H S% L%" → [h, s, l] (s/l as 0-100). Returns null on malformed input. */
export function parseHslChannels(value: string): [number, number, number] | null {
  const m = value.trim().match(/^(\d{1,3}(?:\.\d+)?) (\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]);
  const l = Number(m[3]);
  if (h > 360 || s > 100 || l > 100) return null;
  return [h, s, l];
}

/** HSL (h 0-360, s/l 0-100) → sRGB 0-1 per channel. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = ln - c / 2;
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

function channelLuminance(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance of an "H S% L%" triple. Null on malformed input. */
export function relativeLuminance(hslChannels: string): number | null {
  const hsl = parseHslChannels(hslChannels);
  if (!hsl) return null;
  const [r, g, b] = hslToRgb(...hsl);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Contrast ratio between two "H S% L%" triples. Null if either is malformed. */
export function contrastRatio(fg: string, bg: string): number | null {
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  if (lf === null || lb === null) return null;
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastVerdict(fg: string, bg: string): ContrastVerdict | null {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) return null;
  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
  };
}

/** Convert "H S% L%" to a css color string for swatches. */
export function hslChannelsToCss(value: string): string {
  return `hsl(${value})`;
}

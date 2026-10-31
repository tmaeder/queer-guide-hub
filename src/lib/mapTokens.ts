import type { Track } from '@/components/transit/routeBulletMap';

/**
 * Design tokens → concrete colour strings for MapLibre paint properties.
 *
 * MapLibre parses colours itself and has no idea what a CSS custom property
 * is, so `hsl(var(--foreground))` is not an option in a paint value — every
 * map colour has to be resolved to a literal before it reaches the style.
 *
 * It must be resolved at RUNTIME, not baked into a constant. `/admin/design`
 * publishes sparse token overrides that the edge middleware injects as a
 * `<style id="brand-overrides">` block, so the track colours are whatever the
 * operator set them to — a hardcoded hex would quietly ignore the site's own
 * branding. That is also why these are functions and not a frozen record.
 *
 * Lifted from the private `tokenColor` helper in `AtlasMap.tsx`, which was the
 * only map surface doing this correctly.
 */

/** Resolve a CSS custom property holding HSL channels to an `hsl()` string. */
export function tokenColor(varName: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return alpha != null ? `hsl(${raw} / ${alpha})` : `hsl(${raw})`;
}

/** Subway track colour. Fill-only — never use one for text on paper. */
export function trackColor(track: Track, alpha?: number): string {
  return tokenColor(`--track-${track}`, alpha);
}

/**
 * The ink. Every "outline", "border", "label" and "hairline" on the canvas is
 * this one value — the map used to spell it four different ways
 * (`hsl(0 0% 4%)`, `hsl(0, 0%, 10%)`, `#18181b`, `#0a0a0a`) which had already
 * drifted apart from each other and from the design system.
 */
export const ink = (alpha?: number) => tokenColor('--foreground', alpha);

/** The paper. Pin halos, cluster discs, label haloes, panel fills. */
export const paper = (alpha?: number) => tokenColor('--background', alpha);

/** Muted ink, for secondary canvas labels. */
export const inkMuted = (alpha?: number) => tokenColor('--muted-foreground', alpha);

type Rgb = [number, number, number];

const hslChannelsToRgb = (raw: string): Rgb | null => {
  const m = raw.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const rgbToHsl = ([r, g, b]: Rgb): string => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return `hsl(${r1(h)} ${r1(s * 100)}% ${r1(l * 100)}%)`;
};

/**
 * OPAQUE ink on paper: `t` of the way from paper to ink, mixed in RGB.
 *
 * Use this instead of `ink(alpha)` for any LINE layer. A translucent line
 * colour is composited per feature, so wherever two segments of the same
 * layer meet — every street junction, every vertex where OSM splits a way —
 * the alpha stacks and the crossing prints darker than the street. On a
 * street grid that reads as a dotted rash of knots. An opaque tone has no
 * overlap to stack.
 *
 * Falls back to the translucent form if either token fails to resolve (jsdom
 * without a stylesheet, or a malformed override), so a map never loses its
 * roads to a parse miss.
 */
export function inkOnPaper(t: number): string {
  const css = getComputedStyle(document.documentElement);
  const fg = hslChannelsToRgb(css.getPropertyValue('--foreground').trim());
  const bg = hslChannelsToRgb(css.getPropertyValue('--background').trim());
  if (!fg || !bg) return ink(t);
  return rgbToHsl([0, 1, 2].map((i) => bg[i] + (fg[i] - bg[i]) * t) as Rgb);
}

/**
 * OPAQUE fade of a colour toward paper: `amount` of the way from `color` to
 * the paper, mixed in RGB. On bare paper it looks exactly like `color` at
 * opacity `1 - amount`, but it does not see-through.
 *
 * Use it for anything that can sit on top of itself. A translucent pin shows
 * every pin and ink ring stacked under it, so a dimmed cluster of overlapping
 * pins reads as a muddy smear; an opaque fade keeps the top pin whole.
 *
 * Returns `color` unchanged if either value fails to parse, so a parse miss
 * leaves a pin undimmed rather than unpainted.
 */
export function fadeOnPaper(color: string, amount: number): string {
  const css = getComputedStyle(document.documentElement);
  const c = hslChannelsToRgb(color);
  const bg = hslChannelsToRgb(css.getPropertyValue('--background').trim());
  if (!c || !bg) return color;
  return rgbToHsl([0, 1, 2].map((i) => c[i] + (bg[i] - c[i]) * amount) as Rgb);
}

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

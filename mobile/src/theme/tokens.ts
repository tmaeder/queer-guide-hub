/**
 * Design tokens for the native app.
 *
 * Values are the HSL channel strings from the web's `src/index.css` (`:root`
 * for light, `.dark` for dark), copied verbatim so the two apps cannot drift
 * without a test noticing: `src/theme/__tests__/tokens.drift.test.ts` parses
 * the web stylesheet and fails on any mismatch. Edit `src/index.css` first,
 * then mirror the value here.
 *
 * Track colours are wayfinding, not decoration: one accent per context, never
 * used for body text and never used to encode a state or a risk level.
 */

export const TOKEN_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'muted',
  'muted-foreground',
  'destructive',
  'border',
  'track-pink',
  'track-blue',
  'track-green',
  'track-yellow',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
type Palette = Record<TokenName, string>;

export const light: Palette = {
  background: '0 0% 96.1%',
  foreground: '0 0% 6.7%',
  card: '0 0% 100%',
  'card-foreground': '0 0% 6.7%',
  primary: '0 0% 6.7%',
  'primary-foreground': '0 0% 100%',
  muted: '0 0% 91.8%',
  'muted-foreground': '0 0% 33%',
  destructive: '0 70% 38%',
  border: '0 0% 83.1%',
  'track-pink': '330 100% 56%',
  'track-blue': '193 100% 45%',
  'track-green': '135.6 74.5% 52.4%',
  'track-yellow': '50.1 100% 50%',
};

export const dark: Palette = {
  background: '222 16% 6.5%',
  foreground: '220 14% 96%',
  card: '222 13% 11%',
  'card-foreground': '220 14% 96%',
  primary: '220 14% 96%',
  'primary-foreground': '0 0% 6.7%',
  muted: '222 14% 9%',
  'muted-foreground': '220 9% 66%',
  destructive: '0 80% 66%',
  border: '222 9% 19%',
  'track-pink': '330 100% 56%',
  'track-blue': '193 100% 45%',
  'track-green': '135.6 74.5% 52.4%',
  'track-yellow': '50.1 100% 50%',
};

/** `'220 14% 96%'` → `'hsl(60, 33%, 97%)'`, which React Native and MapLibre both parse. */
export function hsl(channels: string, alpha?: number): string {
  const [h, s, l] = channels.trim().split(/\s+/);
  return alpha == null ? `hsl(${h}, ${s}, ${l})` : `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

export type Colors = Record<TokenName, string>;

export function resolve(palette: Palette): Colors {
  const out = {} as Colors;
  for (const name of TOKEN_NAMES) out[name] = hsl(palette[name]);
  return out;
}

/** 8pt grid, the same even steps the web allows (`p-2` = 8). */
export const space = { 0: 0, 1: 4, 2: 8, 4: 16, 6: 24, 8: 32, 12: 48 } as const;

export const radius = { sm: 4, md: 8, lg: 12, full: 999 } as const;

/** Mirrors the web's editorial ladder at mobile sizes. */
export const text = {
  display: 32,
  headline: 24,
  title: 20,
  body: 16,
  small: 13,
  eyebrow: 11,
} as const;

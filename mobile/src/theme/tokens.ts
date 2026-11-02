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
  background: '60 33% 97%',
  foreground: '0 0% 6.7%',
  card: '60 33% 97%',
  'card-foreground': '0 0% 6.7%',
  primary: '0 0% 6.7%',
  'primary-foreground': '60 33% 97%',
  muted: '60 22.2% 89.4%',
  'muted-foreground': '0 0% 33%',
  destructive: '0 70% 38%',
  border: '60 7.4% 81.4%',
  'track-pink': '330 100% 56%',
  'track-blue': '193 100% 45%',
  'track-green': '135.6 74.5% 52.4%',
  'track-yellow': '50.1 100% 50%',
};

export const dark: Palette = {
  background: '0 0% 6.7%',
  foreground: '60 33% 97%',
  card: '60 6.1% 12.9%',
  'card-foreground': '60 33% 97%',
  primary: '60 33% 97%',
  'primary-foreground': '0 0% 6.7%',
  muted: '60 5.7% 10.4%',
  'muted-foreground': '60 6% 66%',
  destructive: '0 80% 66%',
  border: '60 1.1% 17.5%',
  'track-pink': '330 100% 56%',
  'track-blue': '193 100% 45%',
  'track-green': '135.6 74.5% 52.4%',
  'track-yellow': '50.1 100% 50%',
};

/** `'60 33% 97%'` → `'hsl(60, 33%, 97%)'`, which React Native and MapLibre both parse. */
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

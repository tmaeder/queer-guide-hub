/**
 * Site branding overrides — edge delivery.
 *
 * Reads the single-row `site_branding` table (published sparse override doc,
 * validated at write time by the `branding_validate` Postgres function) and
 * turns it into a `<style id="brand-overrides">` block plus meta-identity
 * overrides for the Pages middleware.
 *
 * Fail-open contract: every error path returns null / stock values so a
 * Supabase outage or a malformed row can never break the site — it just
 * renders with the compiled-in defaults from src/index.css.
 *
 * The token whitelists mirror `branding_validate` in
 * supabase/migrations/20260723174925_site_branding.sql and
 * src/components/admin/design/tokenCatalog.ts. They are re-applied here as
 * defense in depth against rows edited outside the RPCs.
 */
import type { Env } from './sitemap';

export type BrandingDoc = {
  tokens?: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
    global?: Record<string, string>;
  };
  meta?: {
    site_name?: string;
    default_title?: string;
    default_description?: string;
    twitter_handle?: string;
    og_image_url?: string;
    theme_color_light?: string;
    theme_color_dark?: string;
    org_logo_url?: string;
    org_sameas?: string[];
  };
  manifest?: {
    name?: string;
    short_name?: string;
    theme_color?: string;
    background_color?: string;
  };
  email?: Record<string, string>;
  fonts?: {
    display?: FontSlot;
    sans?: FontSlot;
  };
};

export type FontSlot = {
  family?: string;
  files?: Array<{ url?: string; weight?: string; style?: string }>;
};

const COLOR_KEYS = new Set([
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'muted', 'muted-foreground', 'accent', 'accent-foreground',
  'destructive', 'destructive-foreground', 'warning', 'warning-foreground',
  'success', 'success-foreground', 'border', 'input', 'input-bg', 'ring',
  'sidebar-background', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
  'text-primary', 'text-secondary', 'text-muted', 'border-hairline',
  'surface', 'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest', 'surface-dim', 'inverse-surface',
]);

const SIZE_KEYS = new Set([
  'radius-container', 'radius-element', 'radius-badge',
  'text-3xs', 'text-2xs', 'text-xs2', 'text-13', 'text-15', 'text-body-lg',
  'text-title', 'text-headline', 'text-headline-lg', 'text-display', 'text-hero', 'text-hero-xl',
]);

const LINE_HEIGHT_SUFFIX = '--line-height';

const HSL_RE = /^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;
const SIZE_RE = /^\d+(\.\d+)?(rem|px)$/;
const LH_RE = /^\d+(\.\d+)?(rem)?$/;
const TRACKING_RE = /^-?\d+(\.\d+)?em$/;
const TRANSITION_RE = /^[a-z0-9 .,()-]{1,120}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^(https:\/\/|\/)[^\s"'<>]{1,300}$/;
const HANDLE_RE = /^@\w{1,30}$/;

// Fonts — mirror of branding_validate. Host is hardcoded (our storage bucket
// or a site-relative /fonts/ path); only woff2.
const FONT_URL_RE =
  /^(https:\/\/xqeacpakadqfxjxjcewc\.supabase\.co\/storage\/v1\/object\/public\/brand\/|\/fonts\/)[^\s"'<>]{1,300}\.woff2$/;
const FAMILY_RE = /^[A-Za-z0-9 _-]{1,60}$/;
const WEIGHT_RE = /^[1-9]00( [1-9]00)?$/;
const FONT_SLOTS = ['display', 'sans'] as const;
// Stock fallback stacks (src/index.css @theme) — custom family is PREPENDED, so
// a failed webfont still renders these.
const FONT_FALLBACK: Record<(typeof FONT_SLOTS)[number], string> = {
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  sans: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

type ValidFontFile = { url: string; weight: string; style: string };

function validFontFiles(slot: FontSlot | undefined): ValidFontFile[] {
  if (!slot || !Array.isArray(slot.files)) return [];
  return slot.files
    .filter(
      (f) =>
        f &&
        typeof f.url === 'string' &&
        FONT_URL_RE.test(f.url) &&
        typeof f.weight === 'string' &&
        WEIGHT_RE.test(f.weight),
    )
    .slice(0, 4)
    .map((f) => ({
      url: f.url as string,
      weight: f.weight as string,
      style: f.style === 'italic' ? 'italic' : 'normal',
    }));
}

/** family string if the slot is fully valid, else null. */
function validFontFamily(slot: FontSlot | undefined): string | null {
  if (!slot || typeof slot.family !== 'string' || !FAMILY_RE.test(slot.family)) return null;
  return validFontFiles(slot).length > 0 ? slot.family : null;
}

function isValidGlobalToken(key: string, value: string): boolean {
  if (SIZE_KEYS.has(key)) return SIZE_RE.test(value);
  if (key.endsWith(LINE_HEIGHT_SUFFIX) && SIZE_KEYS.has(key.slice(0, -LINE_HEIGHT_SUFFIX.length))) {
    return LH_RE.test(value);
  }
  if (key === 'tracking-label') return TRACKING_RE.test(value);
  if (key === 'transition-smooth') return TRANSITION_RE.test(value);
  return false;
}

function cssDecls(scope: Record<string, string> | undefined, validate: (k: string, v: string) => boolean): string {
  if (!scope) return '';
  return Object.entries(scope)
    .filter(([k, v]) => typeof v === 'string' && validate(k, v))
    .map(([k, v]) => `--${k}:${v}`)
    .join(';');
}

/**
 * Compose the override style block. Returns null when the doc contains no
 * valid token overrides so an empty doc emits nothing (byte-identical head).
 */
export function brandStyleTag(doc: BrandingDoc | null): string | null {
  const tokens = doc?.tokens;
  const fonts = doc?.fonts;
  const light = cssDecls(tokens?.light, (k, v) => COLOR_KEYS.has(k) && HSL_RE.test(v));
  const dark = cssDecls(tokens?.dark, (k, v) => COLOR_KEYS.has(k) && HSL_RE.test(v));
  const global = cssDecls(tokens?.global, isValidGlobalToken);

  // @font-face blocks + --font-* overrides (custom family prepended to stock).
  const faceBlocks: string[] = [];
  const fontVars: string[] = [];
  for (const slot of FONT_SLOTS) {
    const family = validFontFamily(fonts?.[slot]);
    if (!family) continue;
    for (const f of validFontFiles(fonts?.[slot])) {
      faceBlocks.push(
        `@font-face{font-family:'${family}';src:url(${f.url}) format('woff2');` +
          `font-weight:${f.weight};font-style:${f.style};font-display:swap}`,
      );
    }
    const cssVar = slot === 'display' ? '--font-display' : '--font-sans';
    fontVars.push(`${cssVar}:'${family}',${FONT_FALLBACK[slot]}`);
  }

  const rootDecls = [global, light, fontVars.join(';')].filter(Boolean).join(';');
  const parts: string[] = [];
  if (faceBlocks.length) parts.push(faceBlocks.join(''));
  if (rootDecls) parts.push(`:root{${rootDecls}}`);
  if (dark) parts.push(`.dark{${dark}}`);
  if (parts.length === 0) return null;
  return `<style id="brand-overrides">${parts.join('')}</style>`;
}

/** Preload the first file of each valid font slot (perf; avoids FOUT flash). */
export function brandFontPreloads(doc: BrandingDoc | null): string[] {
  const fonts = doc?.fonts;
  if (!fonts) return [];
  const out: string[] = [];
  for (const slot of FONT_SLOTS) {
    if (!validFontFamily(fonts[slot])) continue;
    const first = validFontFiles(fonts[slot])[0];
    if (first) {
      out.push(
        `<link rel="preload" href="${first.url}" as="font" type="font/woff2" crossorigin>`,
      );
    }
  }
  return out;
}

/** Meta identity accessor — drops values that fail format checks. */
export function brandingMeta(doc: BrandingDoc | null): NonNullable<BrandingDoc['meta']> {
  const m = doc?.meta;
  if (!m) return {};
  const str = (v: unknown, re?: RegExp, max = 300): string | undefined =>
    typeof v === 'string' && v.length > 0 && v.length <= max && (!re || re.test(v)) ? v : undefined;
  return {
    site_name: str(m.site_name),
    default_title: str(m.default_title),
    default_description: str(m.default_description),
    twitter_handle: str(m.twitter_handle, HANDLE_RE, 31),
    og_image_url: str(m.og_image_url, URL_RE),
    theme_color_light: str(m.theme_color_light, HEX_RE, 7),
    theme_color_dark: str(m.theme_color_dark, HEX_RE, 7),
    org_logo_url: str(m.org_logo_url, URL_RE),
    org_sameas: Array.isArray(m.org_sameas)
      ? m.org_sameas.filter((u): u is string => typeof u === 'string' && /^https:\/\/[^\s"'<>]{1,300}$/.test(u)).slice(0, 20)
      : undefined,
  };
}

/** Manifest overlay accessor — only whitelisted, format-checked fields. */
export function brandingManifest(doc: BrandingDoc | null): Record<string, string> {
  const m = doc?.manifest;
  if (!m) return {};
  const out: Record<string, string> = {};
  if (typeof m.name === 'string' && m.name.length >= 1 && m.name.length <= 100) out.name = m.name;
  if (typeof m.short_name === 'string' && m.short_name.length >= 1 && m.short_name.length <= 100) {
    out.short_name = m.short_name;
  }
  if (typeof m.theme_color === 'string' && HEX_RE.test(m.theme_color)) out.theme_color = m.theme_color;
  if (typeof m.background_color === 'string' && HEX_RE.test(m.background_color)) {
    out.background_color = m.background_color;
  }
  return out;
}

// In-isolate memo. 60s TTL bounds Supabase load to ~1 request/min/isolate;
// on fetch failure the stale value (or null = stock) is served. Accepted
// staleness after publish: ≤60s per isolate (+5min on edge-cached detail pages).
const TTL_MS = 60_000;
let memo: { value: BrandingDoc | null; expiresAt: number } | null = null;

export async function getBranding(env: Env): Promise<BrandingDoc | null> {
  const now = Date.now();
  if (memo && memo.expiresAt > now) return memo.value;
  try {
    const key = env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
    if (!env.SUPABASE_URL || !key) return memo?.value ?? null;
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/site_branding?id=eq.1&select=published,overrides_enabled`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return memo?.value ?? null;
    const rows = (await res.json()) as Array<{ published?: unknown; overrides_enabled?: boolean }>;
    const row = rows?.[0];
    const value: BrandingDoc | null =
      row && row.overrides_enabled !== false && row.published && typeof row.published === 'object'
        ? (row.published as BrandingDoc)
        : null;
    memo = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return memo?.value ?? null;
  }
}

/**
 * Client-side mirror of the DB `branding_validate` value rules
 * (supabase/migrations/20260723174925_site_branding.sql + 20260724060723_branding_fonts.sql)
 * and the edge re-filter (functions/_lib/branding.ts). The DB is still the
 * authority — this only gives instant inline feedback and disables Save/Publish
 * before a doomed round-trip.
 */
import { GLOBAL_TOKENS, type BrandingDoc } from './tokenCatalog';

export const HSL_RE = /^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;
export const SIZE_RE = /^\d+(\.\d+)?(rem|px)$/;
export const LH_RE = /^\d+(\.\d+)?(rem)?$/;
export const TRACKING_RE = /^-?\d+(\.\d+)?em$/;
export const TRANSITION_RE = /^[a-z0-9 .,()-]{1,120}$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const URL_RE = /^(https:\/\/|\/)[^\s"'<>]{1,300}$/;
export const HTTPS_URL_RE = /^https:\/\/[^\s"'<>]{1,300}$/;
export const HANDLE_RE = /^@\w{1,30}$/;
export const EMAIL_RE = /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]+$/;
export const FONT_URL_RE =
  /^(https:\/\/xqeacpakadqfxjxjcewc\.supabase\.co\/storage\/v1\/object\/public\/brand\/|\/fonts\/)[^\s"'<>]{1,300}\.woff2$/;
export const FAMILY_RE = /^[A-Za-z0-9 _-]{1,60}$/;
export const WEIGHT_RE = /^[1-9]00( [1-9]00)?$/;

const globalKind = new Map(GLOBAL_TOKENS.map((t) => [t.key, t.kind]));

export function validateColorValue(v: string): string | null {
  return HSL_RE.test(v) ? null : 'Use HSL channels, e.g. "0 0% 96%"';
}

export function validateGlobalToken(key: string, v: string): string | null {
  const kind = globalKind.get(key);
  if (kind === 'size' || kind === 'radius') return SIZE_RE.test(v) ? null : 'Use rem or px, e.g. "1rem"';
  if (kind === 'lineHeight') return LH_RE.test(v) ? null : 'Unitless or rem, e.g. "1.4"';
  if (kind === 'tracking') return TRACKING_RE.test(v) ? null : 'Use em, e.g. "0.04em"';
  if (kind === 'transition') return TRANSITION_RE.test(v) ? null : 'Only a–z 0–9 space . , ( ) -';
  return null;
}

export function validateMetaField(key: string, v: string | string[]): string | null {
  switch (key) {
    case 'site_name':
    case 'default_title':
    case 'default_description':
      return typeof v === 'string' && v.length >= 1 && v.length <= 300 ? null : '1–300 characters';
    case 'twitter_handle':
      return typeof v === 'string' && HANDLE_RE.test(v) ? null : 'Like @handle (letters, digits, _)';
    case 'og_image_url':
    case 'org_logo_url':
      return typeof v === 'string' && URL_RE.test(v) ? null : 'An https:// or / URL';
    case 'theme_color_light':
    case 'theme_color_dark':
      return typeof v === 'string' && HEX_RE.test(v) ? null : 'A 6-digit hex color';
    case 'org_sameas':
      if (!Array.isArray(v)) return null;
      return v.every((u) => HTTPS_URL_RE.test(u)) ? null : 'All entries must be https URLs';
    default:
      return null;
  }
}

export function validateManifestField(key: string, v: string): string | null {
  if (key === 'name' || key === 'short_name') {
    return v.length >= 1 && v.length <= 100 ? null : '1–100 characters';
  }
  if (key === 'theme_color' || key === 'background_color') {
    return HEX_RE.test(v) ? null : 'A 6-digit hex color';
  }
  return null;
}

export function validateEmailField(key: string, v: string): string | null {
  switch (key) {
    case 'from_name':
      return v.length >= 1 && v.length <= 100 && !/[<>@"]/.test(v) ? null : '1–100 chars, no < > @ "';
    case 'from_address':
      return EMAIL_RE.test(v) && v.length <= 100 ? null : 'A valid email address';
    case 'logo_url':
      return HTTPS_URL_RE.test(v) ? null : 'An absolute https URL';
    case 'wrapper_bg':
    case 'wrapper_fg':
      return HEX_RE.test(v) ? null : 'A 6-digit hex color';
    default:
      return null;
  }
}

export function validateFontSlot(slot: { family?: string; files?: Array<{ url?: string; weight?: string }> }): string | null {
  if (!slot.family || !FAMILY_RE.test(slot.family)) return 'Family: letters, digits, space, _ or - (1–60)';
  const files = slot.files ?? [];
  if (files.length < 1 || files.length > 4) return 'Add 1–4 font files';
  for (const f of files) {
    if (!f.url || !FONT_URL_RE.test(f.url)) return 'Each file must be an uploaded .woff2';
    if (!f.weight || !WEIGHT_RE.test(f.weight)) return 'Weight like 400 or "100 900"';
  }
  return null;
}

/**
 * Every validation error in a sparse doc, keyed by the same dot-path
 * `flattenBrandingDoc` uses, so consumers can look errors up by field.
 */
export function collectDraftErrors(doc: BrandingDoc): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as const) {
    for (const [k, v] of Object.entries(doc.tokens?.[mode] ?? {})) {
      const e = validateColorValue(v);
      if (e) out[`tokens.${mode}.${k}`] = e;
    }
  }
  for (const [k, v] of Object.entries(doc.tokens?.global ?? {})) {
    const e = validateGlobalToken(k, v);
    if (e) out[`tokens.global.${k}`] = e;
  }
  for (const [k, v] of Object.entries(doc.meta ?? {})) {
    const e = validateMetaField(k, v as string | string[]);
    if (e) out[`meta.${k}`] = e;
  }
  for (const [k, v] of Object.entries(doc.manifest ?? {})) {
    const e = validateManifestField(k, String(v));
    if (e) out[`manifest.${k}`] = e;
  }
  for (const [k, v] of Object.entries(doc.email ?? {})) {
    const e = validateEmailField(k, String(v));
    if (e) out[`email.${k}`] = e;
  }
  for (const slot of ['display', 'sans'] as const) {
    const s = doc.fonts?.[slot];
    if (s) {
      const e = validateFontSlot(s);
      if (e) out[`fonts.${slot}`] = e;
    }
  }
  return out;
}

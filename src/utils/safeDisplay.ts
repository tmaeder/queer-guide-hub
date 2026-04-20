/**
 * Defensive view-model helpers used at known-risk render sites
 * to ensure raw API values never leak placeholder strings to the UI.
 *
 * Catches: null, undefined, NaN, plain objects, the literal strings
 * "null"/"undefined"/"[object Object]", and unrendered moustache tokens
 * like "{{ foo }}" that escape from CMS templates.
 */

const FORBIDDEN_LITERALS = new Set(['null', 'undefined', '[object object]']);
const MOUSTACHE_RE = /\{\{[^}]*\}\}/;

export const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\bnull\b/,
  /\bundefined\b/,
  /\[object Object\]/,
  /\{\{/,
  /\}\}/,
];

export function hasPlaceholderLeak(text: string | null | undefined): boolean {
  if (!text) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

export function safeText(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (FORBIDDEN_LITERALS.has(trimmed.toLowerCase())) return fallback;
  if (MOUSTACHE_RE.test(trimmed)) {
    const cleaned = trimmed.replace(new RegExp(MOUSTACHE_RE.source, 'g'), '').trim();
    return cleaned || fallback;
  }
  return trimmed;
}

export function safeHas(value: unknown): boolean {
  return safeText(value) !== '';
}

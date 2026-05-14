// Client-side synonym validation. Mirrors supabase/functions/search-intelligence/synonyms.ts
// so the admin UI can give instant feedback without a round-trip. The server is
// still authoritative; both files share the same shape and rules.

const LOCALE_RE = /^(\*|[a-z]{2}(-[A-Z]{2})?)$/;

export interface SynonymInput {
  terms: string[];
  replacements: string[];
  locale?: string;
  indexes?: string[];
  is_one_way?: boolean;
  notes?: string;
  source?: 'manual' | 'imported' | 'ai-suggested';
  confidence_score?: number | null;
  tag_id?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  cleaned?: SynonymInput;
}

function trimToLower(s: unknown): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

export function validateSynonym(raw: Partial<SynonymInput>): ValidationResult {
  const errors: string[] = [];
  const terms = Array.isArray(raw.terms) ? raw.terms.map(trimToLower).filter(Boolean) : [];
  const replacements = Array.isArray(raw.replacements)
    ? raw.replacements.map(trimToLower).filter(Boolean)
    : [];
  if (terms.length === 0) errors.push('terms must contain at least one non-empty string');
  if (replacements.length === 0)
    errors.push('replacements must contain at least one non-empty string');
  for (const t of [...terms, ...replacements]) {
    if (t.length > 80) errors.push(`term too long (>80): ${t}`);
  }
  const locale = raw.locale ?? '*';
  if (!LOCALE_RE.test(locale)) errors.push(`invalid locale: ${locale}`);
  const indexes = Array.isArray(raw.indexes)
    ? raw.indexes.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const source = raw.source ?? 'manual';
  if (!['manual', 'imported', 'ai-suggested'].includes(source)) {
    errors.push(`invalid source: ${source}`);
  }
  if (
    raw.confidence_score != null &&
    (typeof raw.confidence_score !== 'number' ||
      raw.confidence_score < 0 ||
      raw.confidence_score > 1)
  ) {
    errors.push('confidence_score must be a number in [0,1]');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    cleaned: {
      terms,
      replacements,
      locale,
      indexes,
      is_one_way: Boolean(raw.is_one_way),
      notes: raw.notes ?? undefined,
      source,
      confidence_score: raw.confidence_score ?? null,
      tag_id: raw.tag_id ?? null,
    },
  };
}

export function buildMeilisearchSynonymMap(
  rows: Array<{
    terms: string[];
    replacements: string[];
    is_one_way: boolean;
    indexes: string[];
    locale: string;
    status: string;
  }>,
  targetIndex: string,
  targetLocale: string | null = null,
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const row of rows) {
    if (row.status !== 'active') continue;
    if (row.indexes && row.indexes.length > 0 && !row.indexes.includes(targetIndex)) continue;
    if (targetLocale && row.locale !== '*' && row.locale !== targetLocale) continue;
    const t = row.terms.map((s) => s.toLowerCase());
    const r = row.replacements.map((s) => s.toLowerCase());
    if (row.is_one_way) {
      for (const term of t) {
        (map[term] ??= new Set<string>());
        for (const rep of r) map[term].add(rep);
      }
    } else {
      const all = Array.from(new Set([...t, ...r]));
      for (const a of all) {
        (map[a] ??= new Set<string>());
        for (const b of all) if (a !== b) map[a].add(b);
      }
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = Array.from(v).sort();
  }
  return out;
}

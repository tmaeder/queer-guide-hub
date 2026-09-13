import type { Env } from './sitemap';
import type { GlossaryLinkTerm, GlossaryMatchMode } from '../../src/lib/glossaryLinks';

/**
 * The inline-glossary-link vocabulary, for the crawler HTML builders.
 *
 * Reads `glossary_link_terms_public` — the same gated view the SPA hook reads,
 * never the base table. Every gate (active tag, not merged, indexable, not
 * adult, not anon-gated, has a definition) lives in the view precisely so this
 * file cannot hold a second, drifting copy of it.
 *
 * Memo and fail-open semantics follow `branding.ts`, for the same reasons: the
 * links are an enhancement, so a slow or unreachable backend must degrade to
 * plain prose rather than hold up a document. Measured on prod 2026-09-05,
 * PostgREST holding a socket open through a Postgres outage put EVERY document
 * at a 19.5s TTFB; the explicit timeout is what prevents that.
 */

const TTL_MS = 300_000;
const FAILURE_TTL_MS = 10_000;
const FETCH_TIMEOUT_MS = 1_000;

/**
 * PostgREST caps an unbounded select at 1,000 rows. An unremarked cap here
 * would make links stop appearing partway through the vocabulary with nothing
 * reporting it, which reads exactly like "those terms are not in the glossary".
 */
const VOCABULARY_HARD_CAP = 5000;

let memo: { value: GlossaryLinkTerm[]; expiresAt: number } | null = null;

const EMPTY: GlossaryLinkTerm[] = [];

function remember(value: GlossaryLinkTerm[], ttl: number): GlossaryLinkTerm[] {
  memo = { value, expiresAt: Date.now() + ttl };
  return value;
}

export async function getGlossaryVocabulary(env: Env): Promise<GlossaryLinkTerm[]> {
  const now = Date.now();
  if (memo && memo.expiresAt > now) return memo.value;
  // Keep serving the last known-good vocabulary through a blip rather than
  // dropping every inline link the moment one fetch fails.
  const lastKnown = memo?.value ?? EMPTY;
  try {
    const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY;
    if (!env.SUPABASE_URL || !key) return remember(lastKnown, FAILURE_TTL_MS);
    const url =
      `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/glossary_link_terms_public` +
      `?select=surface_form,match_mode,slug&limit=${VOCABULARY_HARD_CAP}`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return remember(lastKnown, FAILURE_TTL_MS);
    const rows = (await res.json()) as Array<{
      surface_form?: unknown;
      match_mode?: unknown;
      slug?: unknown;
    }>;
    if (!Array.isArray(rows)) return remember(lastKnown, FAILURE_TTL_MS);
    if (rows.length >= VOCABULARY_HARD_CAP) {
      console.warn(
        `[glossary-links] vocabulary hit the ${VOCABULARY_HARD_CAP}-row cap; terms beyond it will never link`,
      );
    }
    const value: GlossaryLinkTerm[] = [];
    for (const row of rows) {
      if (typeof row?.surface_form !== 'string' || typeof row?.slug !== 'string') continue;
      value.push({
        surfaceForm: row.surface_form,
        slug: row.slug,
        matchMode: (row.match_mode as GlossaryMatchMode) ?? 'exact',
      });
    }
    return remember(value, TTL_MS);
  } catch {
    // Includes the AbortSignal timeout, which lands here as an exception.
    return remember(lastKnown, FAILURE_TTL_MS);
  }
}

/** Test seam — resets the in-isolate memo. */
export function __resetGlossaryVocabularyMemo(): void {
  memo = null;
}

import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';

export type SiResponse<T> = { success: true; data: T } | { success: false; error: string };

interface InvokeOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  searchParams?: Record<string, string | undefined>;
}

/**
 * Call a route on the search-intelligence edge function. Returns the parsed
 * envelope. The user JWT is attached automatically by the supabase client.
 */
export async function callSearchIntelligence<T = unknown>(
  path: string,
  opts: InvokeOptions = {},
): Promise<SiResponse<T>> {
  const cleanPath = path.replace(/^\/+/, '');
  const search = new URLSearchParams();
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v != null && v !== '') search.set(k, v);
    }
  }
  const fullPath = search.toString() ? `${cleanPath}?${search.toString()}` : cleanPath;

  const { data, error } = await supabase.functions.invoke<SiResponse<T>>(
    `search-intelligence/${fullPath}`,
    {
      method: opts.method ?? 'GET',
      body: opts.body as Record<string, unknown> | undefined,
    },
  );
  if (error) {
    return { success: false, error: error.message ?? 'edge function error' };
  }
  if (!data) {
    return { success: false, error: 'empty response' };
  }
  return data;
}

// ── New-tag proposals (source-tags-extract) ─────────────────────────────────

export interface CreatedTag {
  id: string;
  name: string;
  slug: string;
}

/**
 * Mint the glossary tag a `source-tags-extract` proposal asks for.
 *
 * This does NOT go through `applySuggestion` in the edge function: that
 * function's `tag` branch attaches an EXISTING tag to an entity and demands
 * `entity_type`, `entity_id` and `proposed_value.tag_id`. A new-tag proposal
 * carries none of the three (the tag does not exist yet), so approving one
 * server-side throws and leaves the row parked at `approved` with an
 * "auto-apply failed" note. The write therefore happens here, under the
 * admin's own JWT — `unified_tags_staff_insert` (20260904100000) admits
 * admin/moderator/editor.
 *
 * ONLY `name` is sent, and both omissions are load-bearing:
 *
 *  - `slug` is NOT NULL with no column default, so the generated Insert type
 *    demands it — but `unified_tags_normalize_slug()` derives it in a BEFORE
 *    INSERT trigger, and since 20261128100000 a name-derived slug WINS for a
 *    non-ASCII name. A caller-supplied slug beats that seal ("Bühne" → the
 *    lossy `b-hne` instead of `buhne`), which is the exact fault the seal
 *    closed. The row is cast rather than completed.
 *  - `status` defaults to 'active'. Writing it explicitly is what once let an
 *    upsert resurrect 297 deprecated tags into a state the page rendered but
 *    search refused to index.
 *
 * `app.actor` is deliberately not attempted: it is a transaction-local GUC and
 * PostgREST gives each request its own transaction, so a browser client cannot
 * set it. It is also not needed here — `log_unified_tag_change()` RAISEs only
 * on `TG_OP='UPDATE'` of a `human_reviewed` row; on INSERT it only records the
 * actor, and a brand-new row is never human_reviewed. The insert lands in
 * `tag_change_log` as `system:trigger`, exactly as every other admin tag write
 * in this app already does (`useCentralizedTags.createTag`).
 */
export async function createTagFromProposal(name: string): Promise<SiResponse<CreatedTag>> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: 'proposal has no name' };
  const { data, error } = await supabase
    .from('unified_tags')
    .insert({ name: trimmed } as unknown as TablesInsert<'unified_tags'>)
    .select('id, name, slug')
    .single();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'insert returned no row' };
  return { success: true, data: data as CreatedTag };
}

// ── Type definitions matching the edge function payloads ────────────────────

export interface AnalyticsSummary {
  total: number;
  distinct_q: number;
  zero_result: number;
  zero_pct: number;
  clicked: number;
  ctr_pct: number;
  rewritten: number;
  rewrite_pct: number;
  p50_ms: number | null;
  p95_ms: number | null;
  langs: Array<{ lang: string; n: number }>;
}

export interface AnalyticsTopQuery {
  query_normalized: string;
  n: number;
  avg_results: number;
  avg_ms: number;
  zero_n: number;
  ctr_pct: number;
  lang: string | null;
}

export interface AnalyticsZeroResult {
  query_normalized: string;
  n: number;
  lang: string | null;
  last_seen: string;
}

export type SynonymStatus = 'pending' | 'approved' | 'active' | 'rejected' | 'archived';

export interface Synonym {
  id: string;
  terms: string[];
  replacements: string[];
  locale: string;
  indexes: string[];
  is_one_way: boolean;
  status: SynonymStatus;
  source: string;
  confidence_score: number | null;
  notes: string | null;
  tag_id: string | null;
  created_at: string;
  approved_at: string | null;
  archived_at?: string | null;
}

export interface VisibilityWorst {
  entity_type: string;
  entity_id: string;
  title: string;
  score: number;
  computed_at: string;
  suggestions: string[];
}

export interface SynonymList {
  total: number;
  rows: Synonym[];
}

export interface SynonymCounts {
  total: number;
  active: number;
  approved: number;
  pending: number;
  archived: number;
  locales: Array<{ locale: string; n: number }>;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_state: unknown;
  after_state: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

import { supabase } from '@/integrations/supabase/client';

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


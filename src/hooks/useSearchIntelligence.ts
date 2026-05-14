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

export interface IndexesResponse {
  managed: string[];
  meili: Array<{ uid: string; primaryKey?: string }>;
  db_counts: Record<string, number | null>;
}

export interface IndexStats {
  numberOfDocuments: number;
  isIndexing: boolean;
  fieldDistribution: Record<string, number>;
}

export interface Synonym {
  id: string;
  terms: string[];
  replacements: string[];
  locale: string;
  indexes: string[];
  is_one_way: boolean;
  status: 'pending' | 'approved' | 'active' | 'rejected' | 'archived';
  source: 'manual' | 'imported' | 'ai-suggested';
  confidence_score: number | null;
  notes: string | null;
  tag_id: string | null;
  created_at: string;
  approved_at: string | null;
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

export interface SearchDebugResult {
  raw: {
    hits: Array<Record<string, unknown>>;
    estimatedTotalHits?: number;
    processingTimeMs?: number;
  };
  summary: {
    hits: number;
    estimatedTotal: number | null;
    processingTimeMs: number | null;
    roundTripMs: number;
    topMatches: Array<{ id: unknown; title: unknown; score: number | null }>;
  };
}

export interface ConsistencyResult {
  type: string;
  db_rows: number;
  meili_docs: number;
  missing_in_meili: string[];
  orphans_in_meili: string[];
  truncated: boolean;
}

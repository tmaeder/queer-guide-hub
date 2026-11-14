// Adapter contract for feedback fix + retest runners.
//
// A FixRunner takes a queued routine_run row and is responsible for
// (a) handing the prompt off to whatever executes Claude (a GH Actions workflow,
// a webhook target, a future direct API call) and
// (b) eventually causing record_routine_progress / record_fix_proposed to be
// called against the Supabase RPC layer.
//
// For sync runners (mock, future api), the runner can complete the whole thing
// inside dispatch() before returning. For async runners (webhook), dispatch()
// returns immediately with an externalRef and the actual
// progress arrives later via the callback edge function.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

interface FixDispatchInput {
  runId: string;
  storyId: string;
  prompt: string;
  callbackUrl: string;
  hmacSecret: string;
  service: SupabaseClient;
}

interface FixDispatchResult {
  externalRef: string;
  // Optional: if the runner ran the fix synchronously, it returns the final
  // shape so the caller can avoid an extra DB roundtrip.
  syncResult?: {
    prUrl?: string | null;
    commitSha?: string | null;
    filesChanged?: string[] | null;
    summary?: string | null;
    confidence?: 'low' | 'medium' | 'high' | null;
    risks?: string | null;
  };
}

export interface FixRunner {
  name: 'mock' | 'webhook' | 'api' | 'local';
  dispatch(input: FixDispatchInput): Promise<FixDispatchResult>;
}

interface RetestDispatchInput {
  retestId: string;
  routineRunId: string;
  storyId: string;
  kind: 'typecheck' | 'lint' | 'unit' | 'e2e' | 'targeted';
  callbackUrl: string;
  hmacSecret: string;
  service: SupabaseClient;
  /** Files changed by the routine run; only populated when kind='targeted'. */
  filesChanged?: string[];
}

interface RetestDispatchResult {
  externalRef: string;
  syncResult?: {
    status: 'passed' | 'failed' | 'error';
    result: Record<string, unknown>;
  };
}

export interface RetestRunner {
  name: 'mock' | 'webhook' | 'local';
  dispatch(input: RetestDispatchInput): Promise<RetestDispatchResult>;
}

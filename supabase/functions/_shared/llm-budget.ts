import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// Central per-caller LLM spend ceiling (public.llm_budget + llm_budget_consume,
// migration 20260817090000). One row per caller_key; the RPC atomically rolls
// the daily window and spends `n` units, denying when the cap would be
// exceeded. `AI_DISABLED=1` (openai-client.ts) stays the global hard stop —
// this is the per-caller ceiling under it.
//
// Fail-open by design: the RPC missing (fn deployed before the migration — the
// half-ship trap) or erroring must never block or crash a caller. Those paths
// warn once per call and return `{ allowed: true, degraded: true }` so the
// caller falls back to its legacy counting (or runs uncapped where none
// existed). Budget bookkeeping failures are never worth a dead pipeline.

export interface LlmBudgetDecision {
  allowed: boolean
  /** Units left today AFTER this consume. null when unknown (degraded). */
  remaining: number | null
  /** Configured daily cap for the caller. null when unknown (degraded). */
  cap: number | null
  /** Units spent today (post-consume on allow, current on deny). */
  spent: number | null
  /** RPC missing/failed — caller should apply its legacy cap behavior. */
  degraded: boolean
}

const DEGRADED: LlmBudgetDecision = {
  allowed: true,
  remaining: null,
  cap: null,
  spent: null,
  degraded: true,
}

/**
 * Consume `n` units of a caller's daily LLM budget. `n = 0` is a probe: it
 * reports remaining/cap/spent without spending (useful for sizing a batch
 * before per-item consumes).
 */
export async function consumeLlmBudget(
  supabase: SupabaseClient,
  caller: string,
  n = 1
): Promise<LlmBudgetDecision> {
  try {
    const { data, error } = await supabase.rpc('llm_budget_consume', {
      p_caller: caller,
      p_n: n,
    })
    if (error || data == null) {
      console.warn(
        `[llm-budget] ${caller}: rpc unavailable (${error?.message ?? 'null result'}) — legacy/uncapped fallback`
      )
      return { ...DEGRADED }
    }
    const d = data as Record<string, unknown>
    return {
      allowed: d.allowed !== false,
      remaining: typeof d.remaining === 'number' ? d.remaining : null,
      cap: typeof d.cap === 'number' ? d.cap : null,
      spent: typeof d.spent === 'number' ? d.spent : null,
      degraded: false,
    }
  } catch (e) {
    console.warn(
      `[llm-budget] ${caller}: ${(e as Error).message} — legacy/uncapped fallback`
    )
    return { ...DEGRADED }
  }
}

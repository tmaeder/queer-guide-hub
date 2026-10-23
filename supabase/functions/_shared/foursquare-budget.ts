import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export interface FoursquareBudgetVerdict {
  allowed: boolean
  reason?: string
  remaining: number
  spent: number
  limit: number
  safetyMargin: number
  degraded: boolean
}

/**
 * Reserve Places API calls before making a request.
 *
 * This helper fails CLOSED. A missing migration or PostgREST outage must not
 * turn a zero-spend promise into paid API usage. pCalls=0 is a non-consuming
 * status probe.
 */
export async function reserveFoursquareApiCalls(
  supabase: SupabaseClient,
  purpose: string,
  pCalls = 1,
): Promise<FoursquareBudgetVerdict> {
  try {
    const { data, error } = await supabase.rpc('reserve_foursquare_api_calls', {
      p_purpose: purpose,
      p_calls: Math.max(0, Math.floor(pCalls)),
    })
    if (error || !data || typeof data !== 'object') {
      console.error('Foursquare budget unavailable:', error?.message ?? 'empty response')
      return {
        allowed: false,
        reason: 'budget_unavailable',
        remaining: 0,
        spent: 0,
        limit: 0,
        safetyMargin: 0,
        degraded: true,
      }
    }
    const verdict = data as Record<string, unknown>
    return {
      allowed: verdict.allowed === true,
      reason: typeof verdict.reason === 'string' ? verdict.reason : undefined,
      remaining: Number(verdict.remaining ?? 0),
      spent: Number(verdict.spent ?? 0),
      limit: Number(verdict.limit ?? 0),
      safetyMargin: Number(verdict.safety_margin ?? 0),
      degraded: false,
    }
  } catch (error) {
    console.error('Foursquare budget reservation failed:', (error as Error).message)
    return {
      allowed: false,
      reason: 'budget_unavailable',
      remaining: 0,
      spent: 0,
      limit: 0,
      safetyMargin: 0,
      degraded: true,
    }
  }
}

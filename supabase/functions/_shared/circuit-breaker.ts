import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// ============================================================
// Circuit Breaker — protects against cascading external API failures
// States: closed (normal) → open (blocked) → half_open (testing)
// ============================================================

interface CircuitState {
  api_name: string
  state: 'closed' | 'open' | 'half_open'
  failure_count: number
  success_count: number
  open_until: string | null
  threshold: number
  reset_timeout_seconds: number
}

/**
 * Check if an API circuit is open (blocked).
 * Returns { allowed: true } if the API can be called,
 * or { allowed: false, reason } if the circuit is open.
 */
export async function checkCircuit(
  supabase: SupabaseClient,
  apiName: string
): Promise<{ allowed: boolean; reason?: string; state?: string }> {
  const { data, error } = await supabase
    .from('api_circuit_breakers')
    .select('*')
    .eq('api_name', apiName)
    .single()

  if (error || !data) {
    // No circuit breaker configured — allow by default
    return { allowed: true }
  }

  const cb = data as CircuitState

  if (cb.state === 'closed') {
    return { allowed: true, state: 'closed' }
  }

  if (cb.state === 'open') {
    // Check if it's time to try half-open (atomic CAS to prevent race)
    if (cb.open_until && new Date(cb.open_until) <= new Date()) {
      const { data: updated } = await supabase
        .from('api_circuit_breakers')
        .update({ state: 'half_open', updated_at: new Date().toISOString() })
        .eq('api_name', apiName)
        .eq('state', 'open') // CAS: only transition if still open
        .select('state')

      if (updated && updated.length > 0) {
        return { allowed: true, state: 'half_open' }
      }
      // Another caller already transitioned — re-check current state
      return { allowed: true, state: 'half_open' }
    }

    return {
      allowed: false,
      state: 'open',
      reason: `Circuit open for ${apiName} until ${cb.open_until}`,
    }
  }

  // half_open — allow one test request
  return { allowed: true, state: 'half_open' }
}

/**
 * Record a successful API call. Resets failure count, closes circuit.
 *
 * Note: supabase-js v2 rpc() returns a PostgrestBuilder which is thenable but
 * does NOT have a .catch() method. The previous `supabase.rpc(...).catch(...)`
 * threw `TypeError: .catch is not a function` synchronously, which bubbled up
 * through withCircuitBreaker's try/catch and turned every successful call into
 * a recorded failure. This silently broke every source-* edge function using
 * the circuit breaker. The try/catch below is the correct pattern.
 */
export async function recordSuccess(
  supabase: SupabaseClient,
  apiName: string
): Promise<void> {
  try {
    await supabase
      .from('api_circuit_breakers')
      .update({
        state: 'closed',
        failure_count: 0,
        last_success_at: new Date().toISOString(),
        open_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('api_name', apiName)

    // Increment success_count via RPC; fall back to read-modify-write if the RPC is missing.
    try {
      const res = await supabase.rpc('increment_circuit_breaker_success', { p_api_name: apiName })
      if (res && (res as { error?: unknown }).error) throw (res as { error: unknown }).error
    } catch {
      try {
        const { data } = await supabase
          .from('api_circuit_breakers')
          .select('success_count')
          .eq('api_name', apiName)
          .single()
        if (data) {
          await supabase
            .from('api_circuit_breakers')
            .update({ success_count: (data.success_count || 0) + 1 })
            .eq('api_name', apiName)
        }
      } catch { /* swallow — breaker state already updated above */ }
    }
  } catch { /* don't let bookkeeping failures propagate */ }
}

/**
 * Record a failed API call. Increments failure count.
 * If threshold is exceeded, opens the circuit.
 */
export async function recordFailure(
  supabase: SupabaseClient,
  apiName: string,
  errorMsg?: string
): Promise<{ circuitOpened: boolean }> {
  // Atomic increment + conditional open via RPC to prevent concurrent read-modify-write races
  try {
    const { data: result } = await supabase.rpc('circuit_breaker_record_failure', {
      p_api_name: apiName,
      p_error_msg: errorMsg ?? null,
    })
    return { circuitOpened: result?.circuit_opened ?? false }
  } catch {
    // Fallback: non-atomic path if RPC not yet deployed
    const { data } = await supabase
      .from('api_circuit_breakers')
      .select('failure_count, threshold, reset_timeout_seconds, state')
      .eq('api_name', apiName)
      .single()

    if (!data) return { circuitOpened: false }

    const newCount = (data.failure_count || 0) + 1
    const shouldOpen = newCount >= data.threshold

    const updates: Record<string, unknown> = {
      failure_count: newCount,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (shouldOpen) {
      const openUntil = new Date(Date.now() + data.reset_timeout_seconds * 1000)
      updates.state = 'open'
      updates.open_until = openUntil.toISOString()
      console.warn(`[circuit-breaker] Opening circuit for ${apiName} until ${openUntil.toISOString()} (${newCount} failures, error: ${errorMsg})`)
    }

    await supabase.from('api_circuit_breakers').update(updates).eq('api_name', apiName)
    return { circuitOpened: shouldOpen }
  }
}

/**
 * Wrap an async API call with circuit breaker protection.
 * Returns the result on success, or throws with circuit info on failure.
 */
export async function withCircuitBreaker<T>(
  supabase: SupabaseClient,
  apiName: string,
  fn: () => Promise<T>
): Promise<T> {
  const check = await checkCircuit(supabase, apiName)
  if (!check.allowed) {
    throw new CircuitOpenError(apiName, check.reason ?? 'circuit_open')
  }

  try {
    const result = await fn()
    await recordSuccess(supabase, apiName)
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await recordFailure(supabase, apiName, msg)
    throw error
  }
}

/**
 * Batch-friendly circuit checker for per-item loops (the enrichment driver's
 * hot path made 2-3 breaker round-trips per item — ~150 extra DB calls per
 * hourly news invocation purely for bookkeeping).
 *
 * Safe subset of withCircuitBreaker semantics:
 * - the checkCircuit SELECT runs once per batch and is cached ONLY while the
 *   circuit is closed (or unconfigured); open/half_open degrade to per-call
 *   checks so the allow-exactly-one-probe half-open semantics are preserved
 * - success bookkeeping is buffered while cached-closed and flushed once at
 *   batch end (one state UPDATE + success_count += N); in per-call mode
 *   recordSuccess runs immediately so a half-open circuit still heals fast
 * - recordFailure stays strictly per-call (prompt circuit opening); when it
 *   opens the circuit, the local cache flips to blocked for the rest of the
 *   batch
 *
 * Staleness bound: a circuit opened concurrently by another instance is
 * honored at the next local failure or the next batch — bounded by batch
 * size (<=200 items, realistically <=50).
 */
export interface BatchCircuitChecker {
  run<T>(fn: () => Promise<T>): Promise<T>
  /** Flush buffered success bookkeeping. Call once after the batch loop. */
  flush(): Promise<void>
}

export function createBatchCircuitChecker(
  supabase: SupabaseClient,
  apiName: string
): BatchCircuitChecker {
  let cachedClosed = false
  let checkedOnce = false
  let blocked = false
  let blockedReason = 'circuit_open'
  let pendingSuccesses = 0

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (blocked) throw new CircuitOpenError(apiName, blockedReason)

      if (!cachedClosed) {
        const check = await checkCircuit(supabase, apiName)
        if (!check.allowed) {
          blocked = true
          blockedReason = check.reason ?? 'circuit_open'
          throw new CircuitOpenError(apiName, blockedReason)
        }
        // Cache only the steady state; half_open keeps per-call probing.
        cachedClosed = check.state === 'closed' || check.state === undefined
        checkedOnce = true
      }

      try {
        const result = await fn()
        if (cachedClosed) {
          pendingSuccesses++
        } else {
          await recordSuccess(supabase, apiName) // heal half_open immediately
        }
        return result
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        const { circuitOpened } = await recordFailure(supabase, apiName, msg)
        if (circuitOpened) {
          blocked = true
          cachedClosed = false
          blockedReason = `Circuit opened for ${apiName} during batch`
        }
        throw error
      }
    },

    async flush(): Promise<void> {
      if (pendingSuccesses === 0 || !checkedOnce) return
      const n = pendingSuccesses
      pendingSuccesses = 0
      try {
        await supabase
          .from('api_circuit_breakers')
          .update({
            state: 'closed',
            failure_count: 0,
            last_success_at: new Date().toISOString(),
            open_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq('api_name', apiName)
        const { data } = await supabase
          .from('api_circuit_breakers')
          .select('success_count')
          .eq('api_name', apiName)
          .single()
        if (data) {
          await supabase
            .from('api_circuit_breakers')
            .update({ success_count: (data.success_count || 0) + n })
            .eq('api_name', apiName)
        }
      } catch {
        /* bookkeeping only — never propagate */
      }
    },
  }
}

/**
 * Typed circuit-open error so callers can distinguish breaker trips from
 * underlying call failures and degrade gracefully (e.g. skip dedup, re-queue).
 */
export class CircuitOpenError extends Error {
  constructor(public readonly apiName: string, message: string) {
    super(message)
    this.name = 'CircuitOpenError'
  }
}

/**
 * Convenience wrapper around supabase.rpc() with circuit breaker.
 * Returns { data, error, circuitOpen } so callers can check for breaker trips
 * without try/catch boilerplate. Mirrors the supabase-js rpc() shape.
 */
export async function rpcWithBreaker<T = unknown>(
  supabase: SupabaseClient,
  breakerName: string,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null; circuitOpen: boolean }> {
  try {
    const data = await withCircuitBreaker(supabase, breakerName, async () => {
      const res = await supabase.rpc(rpcName, args)
      if (res.error) throw new Error(res.error.message)
      return res.data as T
    })
    return { data, error: null, circuitOpen: false }
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return { data: null, error: { message: err.message }, circuitOpen: true }
    }
    return { data: null, error: { message: (err as Error).message }, circuitOpen: false }
  }
}

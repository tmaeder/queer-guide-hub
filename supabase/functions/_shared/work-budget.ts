/** Reserve time to persist useful work before the gateway's first-byte timeout. */
export function workBudget(ms = 100_000, now: () => number = Date.now) {
  const deadline = now() + ms
  return {
    canStart(reserveMs = 15_000) { return deadline - now() > reserveMs },
    signal(maxMs = 10_000) {
      const remaining = deadline - now()
      if (remaining <= 0) throw new Error('Work budget exhausted')
      return AbortSignal.timeout(Math.max(1, Math.min(maxMs, remaining)))
    },
  }
}

export function boundedBatch(value: unknown, fallback: number, cap: number): number {
  const size = Number(value ?? fallback)
  if (!Number.isFinite(size) || size < 1) return fallback
  return Math.min(cap, Math.max(1, Math.trunc(size)))
}

/**
 * Cost estimation, and the null contract.
 *
 * The point of this table is that llm_call_log had cost columns and ZERO rows,
 * so Workers AI spend was invisible from inside the system — which is how a
 * $765 bill and a 17-day dead pipeline both went unnoticed. A logger that
 * reports a confident wrong number would be worse than the silence it replaces,
 * hence the unknown-model assertions below.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { estimateCostUsd, priceFor } from '../_shared/llm-cost.ts'

Deno.test('costs a known model from its published price', () => {
  // 70B: $0.293/M in, $2.253/M out. 1M in + 1M out = 2.546
  assertEquals(estimateCostUsd('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1e6, 1e6), 2.546)
  // 8B fp8-fast: $0.045 + $0.384
  assertEquals(estimateCostUsd('@cf/meta/llama-3.1-8b-instruct-fp8-fast', 1e6, 1e6), 0.429)
})

Deno.test('the fleet default resolves via the documented alias', () => {
  // `-fast` is not on the pricing page; it resolves to the `-fp8-fast` price.
  assertEquals(
    estimateCostUsd('@cf/meta/llama-3.1-8b-instruct-fast', 1e6, 1e6),
    estimateCostUsd('@cf/meta/llama-3.1-8b-instruct-fp8-fast', 1e6, 1e6),
  )
})

Deno.test('an UNKNOWN model costs null, never zero', () => {
  // Zero is indistinguishable from "free" and silently under-reports spend.
  assertEquals(estimateCostUsd('@cf/some/model-shipped-next-year', 1e6, 1e6), null)
  assertEquals(estimateCostUsd(null, 1000, 1000), null)
  assertEquals(estimateCostUsd(undefined, 1000, 1000), null)
  assertEquals(priceFor('@cf/nope'), null)
})

Deno.test('a real cheap call does not round to zero', () => {
  // ~500 in / ~200 out on the 8B — the common case. If this rounded to 0 the
  // log would recreate the "everything is free" illusion it exists to break.
  const c = estimateCostUsd('@cf/meta/llama-3.1-8b-instruct-fast', 500, 200)
  assertEquals(typeof c, 'number')
  assertEquals((c as number) > 0, true)
})

Deno.test('the 70B really is more expensive than the 8B for the same tokens', () => {
  const big = estimateCostUsd('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1000, 1000)!
  const small = estimateCostUsd('@cf/meta/llama-3.1-8b-instruct-fast', 1000, 1000)!
  assertEquals(big > small, true)
})

Deno.test('a retired model is still costed, not hidden', () => {
  assertEquals(estimateCostUsd('@cf/meta/llama-3.1-8b-instruct', 1e6, 0), 0.282)
})

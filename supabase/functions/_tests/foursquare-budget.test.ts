import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { reserveFoursquareApiCalls } from '../_shared/foursquare-budget.ts'
type Client = Parameters<typeof reserveFoursquareApiCalls>[0]

Deno.test('Foursquare budget fails closed when accounting is unavailable', async () => {
  for (const rpc of [() => Promise.resolve({ data: null, error: { message: 'unavailable' } }),
    () => Promise.reject(new Error('offline'))]) {
    const result = await reserveFoursquareApiCalls({ rpc } as unknown as Client, 'contact-evidence', 5)
    assertEquals(result.allowed, false)
    assertEquals(result.remaining, 0)
    assertEquals(result.degraded, true)
  }
})

Deno.test('Foursquare budget retains the native cap and rejection reason', async () => {
  const rpc = (name: string, args: Record<string, unknown>) => {
    assertEquals(name, 'reserve_foursquare_api_calls')
    assertEquals(args, { p_purpose: 'contact-evidence', p_calls: 5 })
    return Promise.resolve({ data: { allowed: false, reason: 'free_tier_exhausted', spent: 450,
      remaining: 0, limit: 500, safety_margin: 50 }, error: null })
  }
  const result = await reserveFoursquareApiCalls({ rpc } as unknown as Client, 'contact-evidence', 5)
  assertEquals(result.allowed, false)
  assertEquals(result.reason, 'free_tier_exhausted')
  assertEquals(result.limit, 500)
  assertEquals(result.safetyMargin, 50)
})

Deno.test('Foursquare budget preserves explicit reservations and non-consuming probes', async () => {
  for (const count of [0, 5]) {
    const rpc = (_name: string, args: Record<string, unknown>) => {
      assertEquals(args.p_calls, count)
      return Promise.resolve({ data: { allowed: true, remaining: 100, spent: 350, limit: 500, safety_margin: 50 }, error: null })
    }
    const result = await reserveFoursquareApiCalls({ rpc } as unknown as Client, 'contact-evidence', count)
    assertEquals(result.allowed, true)
    assertEquals(result.degraded, false)
  }
})

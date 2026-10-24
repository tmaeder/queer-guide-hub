import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { timingSafeEqual, signHmac, verifyHmac } from './hmac.ts'
import { boundedInt, errorResponse, hasInternalSecret } from './supabase-client.ts'
import { hasValidWebhookSecret } from './webhook-auth.ts'

Deno.test('timingSafeEqual', () => {
  assert(timingSafeEqual('abc', 'abc'))
  assert(!timingSafeEqual('abc', 'abd'))
  assert(!timingSafeEqual('abc', 'abcd'))
  assert(!timingSafeEqual('', ''))
  assert(!timingSafeEqual(null, 'x'))
  assert(!timingSafeEqual('x', undefined))
})

Deno.test('verifyHmac still round-trips', async () => {
  const sig = await signHmac('body', 's3cret')
  assert(await verifyHmac('body', sig, 's3cret'))
  assert(!(await verifyHmac('body2', sig, 's3cret')))
})

Deno.test('secret gates fail closed and match exactly', () => {
  const req = (h: Record<string, string>) => new Request('https://x', { headers: h })
  Deno.env.delete('INTERNAL_INVOKE_SECRET')
  assert(!hasInternalSecret(req({ 'x-internal-secret': '' })))
  Deno.env.set('INTERNAL_INVOKE_SECRET', 'abc123')
  assert(hasInternalSecret(req({ 'x-internal-secret': 'abc123' })))
  assert(!hasInternalSecret(req({ 'x-internal-secret': 'abc124' })))
  assert(!hasInternalSecret(req({})))
  Deno.env.set('HOOK_SECRET_T', 'zz')
  assert(hasValidWebhookSecret(req({ 'x-webhook-secret': 'zz' }), 'HOOK_SECRET_T'))
  assert(!hasValidWebhookSecret(req({ 'x-webhook-secret': 'z' }), 'HOOK_SECRET_T'))
})

Deno.test('errorResponse never echoes free text on 500', async () => {
  const body = async (r: Response) => (await r.json()).error
  const err = console.error
  console.error = () => {}
  try {
    assertEquals(await body(errorResponse('duplicate key violates "users_pkey"', 500)), 'Internal server error')
    assertEquals(await body(errorResponse('upsert_failed', 500)), 'upsert_failed')
    assertEquals(await body(errorResponse('Missing authorization header', 401)), 'Missing authorization header')
    assertEquals(await body(errorResponse(new Error('x'), 500)), 'Internal server error')
    assertEquals(await body(errorResponse('upstream said no', 502)), 'upstream said no')
  } finally {
    console.error = err
  }
})

Deno.test('boundedInt', () => {
  assertEquals(boundedInt(undefined, 300, 1000), 300)
  assertEquals(boundedInt('abc', 300, 1000), 300)
  assertEquals(boundedInt(-5, 25, 100), 25)
  assertEquals(boundedInt(1e9, 300, 1000), 1000)
  assertEquals(boundedInt('42', 300, 1000), 42)
})

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { timingSafeEqual, signHmac, verifyHmac } from './hmac.ts'
import { boundedInt, errorResponse, hasInternalSecret, jsonResponse, pgrstValue, requireAnyRole, STAFF_ROLES } from './supabase-client.ts'
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

// Source guards for the gates added to functions that verify_jwt alone left
// open to the public anon key. Comment-stripped so prose can't satisfy them.
const code = async (f: string) =>
  (await Deno.readTextFile(new URL(`../${f}`, import.meta.url))).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

Deno.test('service-role batch functions require internal/admin auth', async () => {
  for (const f of ['marketplace-categorize', 'marketplace-relevance-rescore', 'marketplace-translate',
                   'marketplace-enrich', 'personality-refresh', 'recommendation-engine']) {
    const s = await code(`${f}/index.ts`)
    const gate = s.indexOf('requireInternalOrAdmin(req')
    assert(gate > 0, `${f}: no requireInternalOrAdmin gate`)
    assert(gate < s.indexOf('req.json()'), `${f}: body read before the auth gate`)
  }
})

Deno.test('intimate-moderation never trusts body user_id from a user caller', async () => {
  const s = await code('intimate-moderation/index.ts')
  assert(/userId = u\.user\.id/.test(s))
  assert(/hasInternalSecret\(req\)\)\s*\{\s*userId = \(body/.test(s), 'body user_id only behind the internal secret')
})

Deno.test('upload-image-r2 requires a signed-in user and rejects SVG', async () => {
  const s = await code('upload-image-r2/index.ts')
  assert(/auth\.getUser\(token\)/.test(s))
  assert(!/startsWith\('image\/'\)/.test(s), 'prefix check admits image/svg+xml')
})

Deno.test('trip-og-image resolves only a share token, never a bare trip_id', async () => {
  const s = await code('trip-og-image/index.ts')
  assert(!/params\.get\('trip_id'\)/.test(s))
  assert(/from\('trip_shares'\)/.test(s) && /expires_at/.test(s))
})

Deno.test('calendar-export reads events as the caller, not service role', async () => {
  const s = await code('calendar-export/index.ts')
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(s))
})

Deno.test('ingest-api-error compares its secret in constant time', async () => {
  const s = await code('ingest-api-error/index.ts')
  assert(/timingSafeEqual\(req\.headers\.get\('X-Error-Secret'\), secret\)/.test(s))
  assert(!/!==\s*secret/.test(s))
})

Deno.test('jsonResponse sanitises a free-text error on 500 only', async () => {
  const err = console.error
  console.error = () => {}
  try {
    const leaky = await (jsonResponse({ success: false, error: 'column "x" does not exist', n: 3 }, 500)).json()
    assertEquals(leaky, { success: false, error: 'Internal server error', n: 3 })
    assertEquals((await jsonResponse({ error: 'load_failed' }, 500).json()).error, 'load_failed')
    assertEquals((await jsonResponse({ error: 'bad input here' }, 400).json()).error, 'bad input here')
    assertEquals(await jsonResponse([1, 2], 500).json(), [1, 2])
  } finally {
    console.error = err
  }
})

Deno.test('pgrstValue keeps filter grammar out of values', () => {
  assertEquals(pgrstValue('a.com'), '"a.com"')
  assertEquals(pgrstValue('a.com,slug.neq.x'), '"a.com,slug.neq.x"')
  assertEquals(pgrstValue('a"b\\c'), '"a\\"b\\\\c"')
  assertEquals(pgrstValue(null), '""')
  assertEquals(pgrstValue(42), '"42"')
})

Deno.test('requireAnyRole: staff passes, others and anon do not', async () => {
  Deno.env.set('INTERNAL_INVOKE_SECRET', 'abc123')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc-key')
  const roles: Record<string, string[]> = { ed: ['editor'], mem: [], adm: ['admin'] }
  let askedFor: string[] = []
  const fake = {
    auth: { getUser: async (t: string) => ({ data: { user: roles[t] ? { id: t } : null }, error: null }) },
    from: () => ({ select: () => ({ eq: (_c: string, uid: string) => ({ in: (_r: string, want: string[]) => {
      askedFor = want
      return { limit: async () => ({ data: (roles[uid] ?? []).filter((r) => want.includes(r)).map((role) => ({ role })) }) }
    } }) }) }),
  }
  const client = fake as unknown as Parameters<typeof requireAnyRole>[1]
  const req = (h: Record<string, string>) => new Request('https://x', { headers: h })
  const st = async (h: Record<string, string>) => {
    const r = await requireAnyRole(req(h), client, STAFF_ROLES)
    return r instanceof Response ? r.status : 'ok'
  }
  assertEquals(await st({ Authorization: 'Bearer ed' }), 'ok')
  assertEquals(askedFor, ['admin', 'moderator', 'editor'])
  assertEquals(await st({ Authorization: 'Bearer adm' }), 'ok')
  assertEquals(await st({ Authorization: 'Bearer mem' }), 403)
  assertEquals(await st({ Authorization: 'Bearer nobody' }), 401)
  assertEquals(await st({}), 401)
  assertEquals(await st({ 'x-internal-secret': 'abc123' }), 'ok')
  assertEquals(await st({ 'x-internal-secret': 'abc124' }), 401)
  assertEquals(await st({ Authorization: 'Bearer svc-key' }), 'ok')
})

Deno.test('staff/operator gates sit before the body is read', async () => {
  for (const [f, call] of [
    ['classify-relevance-backfill', 'requireInternalOrAdmin(req'],
    ['push-feedback-to-github', 'requireAnyRole(req'],
    ['story-narrate', 'requireAnyRole(req'],
    ['cms-ai', 'requireAnyRole(req'],
  ] as const) {
    const s = await code(`${f}/index.ts`)
    const gate = s.indexOf(call)
    assert(gate > 0, `${f}: no ${call} gate`)
    const body = s.search(/req(uest)?\.json\(\)/)
    assert(body === -1 || gate < body, `${f}: body read before the auth gate`)
  }
})

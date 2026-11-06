import { assertEquals } from 'jsr:@std/assert'

Deno.test('Review defers a 529 batch, recovers on the next run, and still fails on auth errors', async () => {
  const env = {
    SUPABASE_URL: 'https://db.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    INTERNAL_INVOKE_SECRET: 'test-internal-secret',
    JEV_API_KEY: 'test-model-key',
    JEV_MODEL: 'jev-1.14.0',
  }
  const previous = Object.entries(env).map(([key]) => [key, Deno.env.get(key)] as const)
  const originalServe = Deno.serve
  const originalFetch = globalThis.fetch
  let handler: ((request: Request) => Promise<Response>) | undefined
  let modelStatus = 529
  let modelCalls = 0
  const finished: Array<{ p_result: Record<string, unknown>; p_evidence: unknown[] }> = []
  const runLogs: Array<{ status: string; summary: { reason?: string } }> = []
  const jobs = ['first', 'second'].map(case_id => ({ case_id, lease_token: 'lease', queue_type: 'milestone-review' }))
  try {
    for (const [key, value] of Object.entries(env)) Deno.env.set(key, value)
    Deno.serve = ((fn: typeof handler) => { handler = fn }) as typeof Deno.serve
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      const path = url.pathname.split('/').pop()
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (url.hostname === 'api.typesafe.ai') {
        modelCalls++
        if (modelStatus !== 200) return new Response(null, { status: modelStatus })
        const answers = Object.fromEntries(Object.entries(body.questions).map(([name, question]) => {
          const choices = Object.keys((question as { criteria: object }).criteria)
          const choice = name === 'decision' ? 'abstain' : name === 'reason' ? 'missing_source' : name === 'risk' ? 'routine' : 'missing'
          return [name, { type: 'choice', choice, confidence: 1,
            probabilities: Object.fromEntries(choices.map(key => [key, Number(key === choice)])) }]
        }))
        return Response.json({ model: body.model, answers, usage: { input_tokens: 100, output_tokens: 10 } })
      }
      if (url.hostname !== 'db.example.test') throw new Error('Unexpected network request')
      if (path === 'claim_jev_review_jobs') return Response.json(jobs)
      if (path === 'get_jev_review_context') return Response.json({
        item: { queue_type: 'milestone-review', title: 'Synthetic milestone' },
        record: null, proposal: null, related: {}, research: null, urls: [], input_hash: 'hash',
        candidates: [{ id: 'reject', action: 'reject', explanation: 'Synthetic proposal', payload: { integrity_rule: 'fixture' } }],
      })
      if (path === 'reserve_jev_budget' || path === 'settle_jev_budget') return Response.json(true)
      if (path === 'finish_jev_review_job') {
        finished.push(body)
        return Response.json({ status: body.p_result.retry ? 'retry' : 'blocked' })
      }
      if (path === 'admin_automation_runs') runLogs.push(body)
      else if (path !== 'admin_automations') throw new Error('Unexpected database request: ' + path)
      return new Response(null, { status: 204 })
    }) as typeof fetch
    await import('./index.ts')
    const invoke = () => handler!(new Request('https://edge.example.test', {
      method: 'POST', headers: { 'x-internal-secret': env.INTERNAL_INVOKE_SECRET },
      body: JSON.stringify({ dry_run: false, run_id: 1 }),
    }))
    for (let i = 0; i < 3; i++) {
      const overloaded = await invoke()
      assertEquals(overloaded.status, 200)
      const outcome = await overloaded.json()
      assertEquals([outcome.applied, outcome.blocked, outcome.retry, outcome.provider_overload_deferred], [0, 0, 2, 2])
    }
    assertEquals(modelCalls, 3)
    assertEquals(finished.map(job => job.p_result), Array(6).fill({ retry: 'Jev HTTP 529' }))
    assertEquals(finished.filter(job => job.p_evidence.length === 0).length, 3)
    assertEquals(runLogs.map(log => [log.status, log.summary.reason]), Array(3).fill(['success', 'Jev HTTP 529']))

    modelStatus = 200
    const recovered = await invoke()
    assertEquals(recovered.status, 200)
    assertEquals((await recovered.json()).blocked, 2)
    assertEquals(modelCalls, 5)
    assertEquals(runLogs.at(-1)?.summary.reason, undefined)

    modelStatus = 401
    const invalidKey = await invoke()
    assertEquals(invalidKey.status, 503)
    assertEquals((await invalidKey.json()).error, 'Jev HTTP 401')
    assertEquals(runLogs.at(-1)?.status, 'error')
  } finally {
    Deno.serve = originalServe
    globalThis.fetch = originalFetch
    for (const [key, value] of previous) value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value)
  }
})

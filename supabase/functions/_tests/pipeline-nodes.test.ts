/**
 * Smoke tests for pipeline node edge functions.
 * These call the actual deployed functions and assert structural response shape.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars.
 */
import { assertEquals } from 'jsr:@std/assert'

const BASE = Deno.env.get('SUPABASE_URL') ?? ''
const KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

async function invoke(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

const skip = !BASE || !KEY

Deno.test({ name: 'pipeline-normalize: returns success shape', ignore: skip, async fn() {
  const res = await invoke('pipeline-normalize', { pipeline_run_id: '00000000-0000-0000-0000-000000000001', node_id: 'normalize', dry_run: true, entity_type: 'venue', batch_size: 1 })
  assertEquals(typeof res.success, 'boolean')
}})

Deno.test({ name: 'pipeline-validate: returns success shape', ignore: skip, async fn() {
  const res = await invoke('pipeline-validate', { pipeline_run_id: '00000000-0000-0000-0000-000000000001', node_id: 'validate', dry_run: true, entity_type: 'venue', batch_size: 1 })
  assertEquals(typeof res.success, 'boolean')
}})

Deno.test({ name: 'pipeline-deduplicate: returns success shape', ignore: skip, async fn() {
  const res = await invoke('pipeline-deduplicate', { pipeline_run_id: '00000000-0000-0000-0000-000000000001', node_id: 'dedup', dry_run: true, entity_type: 'venue', batch_size: 1 })
  assertEquals(typeof res.success, 'boolean')
}})

Deno.test({ name: 'source-booking: returns success (skipped or items)', ignore: skip, async fn() {
  const res = await invoke('source-booking', { dry_run: true })
  assertEquals(res.success, true)
  const valid = res.skipped === true || typeof res.items === 'number'
  assertEquals(valid, true)
}})

Deno.test({ name: 'source-foursquare: never returns 500', ignore: skip, async fn() {
  const res = await invoke('source-foursquare', { dry_run: true })
  assertEquals(res.success, true)
}})

Deno.test({ name: 'pipeline-media-process: returns success shape', ignore: skip, async fn() {
  const res = await invoke('pipeline-media-process', { pipeline_run_id: '00000000-0000-0000-0000-000000000001', node_id: 'media', dry_run: true, batch_size: 1 })
  assertEquals(typeof res.success, 'boolean')
}})

Deno.test({ name: 'pipeline-safety-relevance: returns success shape', ignore: skip, async fn() {
  const res = await invoke('pipeline-safety-relevance', { pipeline_run_id: '00000000-0000-0000-0000-000000000001', node_id: 'safety', dry_run: true, batch_size: 1 })
  assertEquals(typeof res.success, 'boolean')
}})

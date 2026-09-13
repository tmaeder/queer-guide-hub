import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { resolveStagedImageUrl } from './image-check.ts'

// --- resolution chain ------------------------------------------------------
// pipeline-normalize only sets a top-level image_url on the PERSONALITY branch.
// For news it writes images[], and the source adapter writes metadata.image_url.
// Reading image_url alone found nothing on 0/3,107 podcast rows.

Deno.test('finds the podcast artwork the old read missed', () => {
  const url = 'https://megaphone.imgix.net/podcasts/abc/image/def.jpeg'
  assertEquals(
    resolveStagedImageUrl({ metadata: { media_type: 'podcast', image_url: url } }),
    url,
  )
})

Deno.test('finds an image in images[] when no scalar is set', () => {
  assertEquals(
    resolveStagedImageUrl({ images: ['https://example.com/a.jpg'] }),
    'https://example.com/a.jpg',
  )
})

Deno.test('prefers the scalar over images[] over metadata', () => {
  const all = {
    image_url: 'https://example.com/scalar.jpg',
    images: ['https://example.com/array.jpg'],
    metadata: { image_url: 'https://example.com/meta.jpg' },
  }
  assertEquals(resolveStagedImageUrl(all), 'https://example.com/scalar.jpg')

  const { image_url: _drop, ...noScalar } = all
  assertEquals(resolveStagedImageUrl(noScalar), 'https://example.com/array.jpg')

  assertEquals(
    resolveStagedImageUrl({ metadata: all.metadata }),
    'https://example.com/meta.jpg',
  )
})

Deno.test('falls through a non-http candidate to a usable one', () => {
  // A relative path or data: blob is not something probeImage can HEAD, and
  // must not shadow a real URL sitting further down the chain.
  assertEquals(
    resolveStagedImageUrl({
      image_url: '/local/placeholder.png',
      metadata: { image_url: 'https://example.com/real.jpg' },
    }),
    'https://example.com/real.jpg',
  )
  assertEquals(
    resolveStagedImageUrl({
      images: ['data:image/gif;base64,R0lGOD'],
      metadata: { image_url: 'https://example.com/real.jpg' },
    }),
    'https://example.com/real.jpg',
  )
})

Deno.test('genuinely absent stays undefined', () => {
  assertEquals(resolveStagedImageUrl({}), undefined)
  assertEquals(resolveStagedImageUrl(null), undefined)
  assertEquals(resolveStagedImageUrl(undefined), undefined)
  assertEquals(resolveStagedImageUrl({ image_url: '   ' }), undefined)
  assertEquals(resolveStagedImageUrl({ images: [], metadata: {} }), undefined)
})

Deno.test('non-string junk never escapes as a URL', () => {
  assertEquals(resolveStagedImageUrl({ image_url: 42, images: [null, {}] }), undefined)
})

Deno.test('a previous run\'s replacement can never be an input', () => {
  // enriched.image_url is the Pexels replacement this pipeline is about to
  // decide on. If it fed back in, one bad run would suppress the real artwork
  // forever. The resolver only ever sees normalized_data.
  const normalized = { metadata: { image_url: 'https://example.com/real.jpg' } }
  assertEquals(resolveStagedImageUrl(normalized), 'https://example.com/real.jpg')
})

// --- drift against the commit RPC -----------------------------------------
// The two must agree, or we probe and judge one image and publish another.
// Finds the migration by CONTENT, never a pinned filename — a later migration
// redefining the RPC must be the one checked.

Deno.test('resolution order still matches news_commit_staging_batch', async () => {
  const dir = new URL('../../../migrations/', import.meta.url)
  const names: string[] = []
  for await (const e of Deno.readDir(dir)) {
    if (e.isFile && e.name.endsWith('.sql')) names.push(e.name)
  }
  names.sort()

  let latest: { name: string; sql: string } | null = null
  for (const name of names) {
    const sql = await Deno.readTextFile(new URL(name, dir))
    if (/FUNCTION\s+public\.news_commit_staging_batch/i.test(sql)) latest = { name, sql }
  }
  assert(latest, 'no migration defines news_commit_staging_batch')

  // Strip comments so prose about the chain cannot satisfy the assertion.
  const body = latest.sql.replace(/--[^\n]*/g, '')
  const assign = body.match(/v_image\s*:=\s*coalesce\(([\s\S]*?)\);/i)
  assert(assign, `no v_image coalesce found in ${latest.name}`)

  const chain = assign[1]
  const order = [
    /v_enr->>'image_url'/,
    /v_norm->>'image_url'/,
    /v_images->>0/,
    /v_meta->>'image_url'/,
  ]
  let cursor = -1
  for (const re of order) {
    const at = chain.search(re)
    assert(at > -1, `${re} missing from the RPC chain in ${latest.name}`)
    assert(at > cursor, `${re} is out of order in ${latest.name}`)
    cursor = at
  }
})

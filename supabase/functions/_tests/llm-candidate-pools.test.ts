import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

// Guards the LLM candidate pools in the two news-quality functions.
//
// Both built their tag pool with `.from('unified_tags').select('slug').limit(200)` —
// no order, no status filter. Postgres serves that limit from unified_tags_slug_key
// (Index Only Scan, verified on prod), so "200 arbitrary tags" was really the first
// 200 slugs ALPHABETICALLY. QUALITY_SYSTEM_PROMPT tells the model to "prefer existing
// tags listed in user message", so 368 news articles were tagged out of the ab*/ac*
// region of the vocabulary regardless of subject — including a murder story tagged
// with the kink term `abduction-play`. Retracted in migration
// 20261007100000_news_tag_vocabulary_dump_retraction.sql.
//
// The failure is invisible in review: the query reads as "grab some tags" and returns
// 200 real, live tag slugs. Only the ORDER betrays it. So assert on the order.

const FILES = [
  'pipeline-quality-enhance',
  'news-quality-backfill',
] as const

async function poolSource(fn: string): Promise<string> {
  const url = new URL(`../${fn}/index.ts`, import.meta.url)
  const src = await Deno.readTextFile(url)
  const start = src.indexOf('async function loadCandidatePools')
  assert(start > -1, `${fn}: loadCandidatePools not found — did the pool loader move?`)
  const end = src.indexOf('\n}', src.indexOf('return {', start))
  assert(end > start, `${fn}: could not bound loadCandidatePools`)
  // Comments are stripped here, not per-assertion: this file's own explanatory
  // comments quote the defective `.limit(200)` call, which a naive scan counts as code.
  return src
    .slice(start, end)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
}

/** The single `unified_tags` query inside loadCandidatePools, whitespace-collapsed. */
function tagQuery(lines: string, fn: string): string {
  const at = lines.indexOf("from('unified_tags')")
  assert(at > -1, `${fn}: loadCandidatePools no longer queries unified_tags`)
  const stmt = lines.slice(at, lines.indexOf('\n', lines.indexOf('.limit(', at)))
  return stmt.replace(/\s+/g, ' ')
}

for (const fn of FILES) {
  Deno.test(`${fn}: tag pool is ranked, not an alphabetical page`, async () => {
    const q = tagQuery(await poolSource(fn), fn)

    // An unordered .limit() is the whole defect: it silently becomes ORDER BY slug.
    assert(
      q.includes('.order('),
      `${fn}: unified_tags pool has no .order() — an unordered .limit() is served from ` +
        `unified_tags_slug_key and hands the model the alphabetical head of the vocabulary`,
    )
    // Ranking must be by usage. Ordering by slug/name/created_at reintroduces an
    // arbitrary slice under a different name.
    assert(
      q.includes("order('usage_count'"),
      `${fn}: unified_tags pool must rank by usage_count (got: ${q})`,
    )
    assert(
      q.includes('ascending: false'),
      `${fn}: usage_count must be descending — ascending selects the 200 LEAST-used tags`,
    )
  })

  Deno.test(`${fn}: tag pool excludes retired vocabulary`, async () => {
    const q = tagQuery(await poolSource(fn), fn)

    // run_tag_assignment_reconcile turns this text into durable graph edges and only
    // resolves active, unmerged tags. Offering anything else invites the model to
    // produce tags that either die on the floor or resurrect a retired term.
    assert(
      q.includes("eq('status', 'active')"),
      `${fn}: unified_tags pool must filter status='active' — most of the vocabulary is deprecated`,
    )
    assert(
      q.includes("is('merged_into_id', null)"),
      `${fn}: unified_tags pool must exclude merged tags`,
    )
  })

  Deno.test(`${fn}: every candidate pool bounded`, async () => {
    const pool = await poolSource(fn)
    const froms = [...pool.matchAll(/from\('(\w+)'\)/g)].map((m) => m[1])
    assertEquals(
      froms.length,
      [...pool.matchAll(/\.limit\(/g)].length,
      `${fn}: every candidate pool must carry a .limit() (pools: ${froms.join(', ')})`,
    )
  })
}

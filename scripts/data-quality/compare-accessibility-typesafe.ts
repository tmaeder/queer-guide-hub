// Compare two judges of "does this citation support this accessibility slug?"
// against HAND-READ ground truth:
//
//   regex    — supabase/functions/_shared/accessibility-evidence.ts (production)
//   typesafe — supabase/functions/_shared/accessibility-claim-check.ts (experiment)
//
// Ground truth is LIVE_QUEUE (accessibility-evidence.fixtures.ts): the 22
// proposals open on prod on 2026-10-01, each slug hand-read before either judge
// existed. The regex guard was calibrated on these rows, so it is EXPECTED to
// score perfectly on them; the interesting numbers are where TypeSafe disagrees
// with the hand read, and — via --cases — how both do on rows neither was
// tuned on.
//
// Usage (Node 22.18+, which strips TypeScript types natively):
//   node scripts/data-quality/compare-accessibility-typesafe.ts --dry-run
//   TYPESAFE_API_KEY=... node scripts/data-quality/compare-accessibility-typesafe.ts
//   ... --cases held-out.json        extra rows, same shape as LIVE_QUEUE entries
//   ... --max-requests 40            hard cap on live API calls (default 30)
//   ... --out <dir>                  where requests/answers/report are written
//
// Every live response is cached by a hash of its exact request body, so a rerun
// replays rather than re-spends, and every result in the report can be traced
// to the payload that produced it. Delete the cache file to run live again.
//
// Exit codes: 0 report written; 1 a request failed; 2 could not run (no key
// and no --dry-run, or the budget would be exceeded) — "could not look" is
// never reported as a clean comparison.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { filterAccessibilityByEvidence } from '../../supabase/functions/_shared/accessibility-evidence.ts'
import { LIVE_QUEUE, type Row } from '../../supabase/functions/_shared/accessibility-evidence.fixtures.ts'
import {
  buildClaimRequest,
  callTypeSafe,
  type ClaimVerdict,
  decideClaim,
  quoteQuestionId,
  relationProbs,
  type RelationProbs,
  sourceQuestionId,
} from '../../supabase/functions/_shared/accessibility-claim-check.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const DRY = process.argv.includes('--dry-run')
const MAX_REQUESTS = Number(arg('--max-requests') ?? 30)
const OUT = resolve(arg('--out') ?? 'scripts/data-quality/out/typesafe-accessibility')
const KEY = process.env.TYPESAFE_API_KEY ?? ''

const rows: Array<Row & { set: string }> = LIVE_QUEUE.map((r) => ({ ...r, set: 'live_queue' }))
const casesFile = arg('--cases')
if (casesFile) {
  const extra = JSON.parse(readFileSync(casesFile, 'utf8')) as Row[]
  rows.push(...extra.map((r) => ({ ...r, set: 'held_out' })))
}

mkdirSync(OUT, { recursive: true })
const cachePath = join(OUT, 'cache.json')
const cache: Record<string, unknown> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}

const prepared = rows.map((row) => ({
  row,
  req: buildClaimRequest({ venueName: row.name, sourceText: row.src, slugs: row.slugs, citations: row.citations }),
}))
const hashOf = (body: unknown) => createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
const needLive = prepared.filter(({ req }) => Object.keys(req.body.questions).length > 0 && !cache[hashOf(req.body)])
const questionCount = prepared.reduce((n, { req }) => n + Object.keys(req.body.questions).length, 0)

writeFileSync(join(OUT, 'requests.json'), JSON.stringify(prepared.map(({ row, req }) => ({
  venue: row.name, set: row.set, hash: hashOf(req.body), body: req.body,
})), null, 2))

console.log(`${rows.length} rows, ${questionCount} questions, ${needLive.length} uncached requests`)
if (DRY) {
  console.log(`dry run: request bodies written to ${join(OUT, 'requests.json')}; nothing sent`)
  process.exit(0)
}
if (needLive.length > 0 && !KEY) {
  console.error('TYPESAFE_API_KEY is not set and some requests are not cached — could not run. Use --dry-run to inspect payloads.')
  process.exit(2)
}
if (needLive.length > MAX_REQUESTS) {
  console.error(`${needLive.length} live requests exceed --max-requests ${MAX_REQUESTS}; refusing to spend past the budget.`)
  process.exit(2)
}

let inputTokens = 0
for (const { row, req } of needLive) {
  try {
    const res = await callTypeSafe(req.body, KEY)
    cache[hashOf(req.body)] = res
    inputTokens += res.usage?.input_tokens ?? 0
    writeFileSync(cachePath, JSON.stringify(cache, null, 2))
  } catch (err) {
    // A failed call is an error, never an empty answer set.
    const e = err as { message?: string; body?: string }
    console.error(`request failed for ${row.name}: ${e.message} ${e.body ?? ''}`)
    process.exit(1)
  }
}

type Expected = { kept: boolean; reason: string }
interface Line {
  set: string
  venue: string
  slug: string
  expected: Expected
  regex: Expected
  typesafe: Expected
  probs: Record<string, RelationProbs | undefined>
}

const lines: Line[] = []
const modelsSeen = new Set<string>()
for (const { row, req } of prepared) {
  const res = cache[hashOf(req.body)] as { model?: string; answers?: Record<string, unknown> } | undefined
  if (res?.model) modelsSeen.add(res.model)
  const answers: Record<string, RelationProbs | undefined> = {}
  for (const [id, a] of Object.entries(res?.answers ?? {})) answers[id] = relationProbs(a)

  const rx = filterAccessibilityByEvidence(row.slugs, row.citations, row.src)
  for (const slug of new Set(row.slugs)) {
    const expected: Expected = row.keep.includes(slug)
      ? { kept: true, reason: 'supported' }
      : { kept: false, reason: row.why[slug] ?? '?' }
    const rxRef = rx.refused.find((r) => r.slug === slug)
    const regex: Expected = rxRef ? { kept: false, reason: rxRef.reason } : { kept: true, reason: 'supported' }
    const v: ClaimVerdict = decideClaim(slug, req, answers)
    const probs: Record<string, RelationProbs | undefined> = {}
    req.quotes.forEach((q, i) => (probs[`quote: ${q}`] = answers[quoteQuestionId(slug, i)]))
    probs['description'] = answers[sourceQuestionId(slug)]
    lines.push({ set: row.set, venue: row.name, slug, expected, regex, typesafe: { kept: v.ok, reason: v.reason }, probs })
  }
}

function score(set: string, judge: 'regex' | 'typesafe') {
  const ls = lines.filter((l) => l.set === set)
  const decision = ls.filter((l) => l[judge].kept === l.expected.kept).length
  const reason = ls.filter((l) => l[judge].reason === l.expected.reason).length
  const falseAdopt = ls.filter((l) => l[judge].kept && !l.expected.kept).length
  const falseRefuse = ls.filter((l) => !l[judge].kept && l.expected.kept).length
  return { claims: ls.length, decision_agree: decision, reason_agree: reason, false_adopt: falseAdopt, false_refuse: falseRefuse }
}

const sets = [...new Set(lines.map((l) => l.set))]
const summary = Object.fromEntries(sets.map((s) => [s, { regex: score(s, 'regex'), typesafe: score(s, 'typesafe') }]))
const disagreements = lines.filter((l) => l.typesafe.kept !== l.expected.kept || l.regex.kept !== l.expected.kept)

writeFileSync(join(OUT, 'report.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  models: [...modelsSeen],
  summary,
  disagreements,
  lines,
}, null, 2))

console.log(`models: ${[...modelsSeen].join(', ') || '(none answered)'}; live input tokens this run: ${inputTokens}`)
for (const s of sets) {
  for (const judge of ['regex', 'typesafe'] as const) {
    const x = summary[s][judge]
    console.log(`${s.padEnd(11)} ${judge.padEnd(9)} decision ${x.decision_agree}/${x.claims}  reason ${x.reason_agree}/${x.claims}  false-adopt ${x.false_adopt}  false-refuse ${x.false_refuse}`)
  }
}
// False adoptions are the error that matters: a wrong access claim published.
for (const l of disagreements) {
  const tag = (e: Expected) => (e.kept ? 'KEEP' : `refuse:${e.reason}`)
  console.log(`  ${l.venue} / ${l.slug}: hand ${tag(l.expected)} | regex ${tag(l.regex)} | typesafe ${tag(l.typesafe)}`)
}
console.log(`report: ${join(OUT, 'report.json')}`)

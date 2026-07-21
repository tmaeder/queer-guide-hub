#!/usr/bin/env npx tsx
// Stage C helper: split dedupe/candidates.json into
//   dedupe/auto-decisions.json   — high-similarity new-new pairs auto-marked duplicate
//   dedupe/batches/NNN.json      — the rest, for LLM review (≤ BATCH pairs each)
//
// Usage: npx tsx scripts/data-quality/history-import/prep-dedupe-batches.ts

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const dedupeDir = join(HERE, 'dedupe')
const batchDir = join(dedupeDir, 'batches')
const BATCH = 130
const AUTO_SIM = 0.62

interface Candidate {
  id: string
  kind: string
  a_title: string
  b_title: string
  a_ctx: string
  b_ctx: string
  reason: string
}

const candidates: Candidate[] = JSON.parse(readFileSync(join(dedupeDir, 'candidates.json'), 'utf8'))
const simOf = (r: string) => {
  const m = r.match(/sim ([0-9.]+)/)
  return m ? Number(m[1]) : -1
}

const auto = candidates.filter((c) => c.kind === 'new-new' && simOf(c.reason) >= AUTO_SIM)
const review = candidates.filter((c) => !auto.includes(c))

writeFileSync(
  join(dedupeDir, 'auto-decisions.json'),
  JSON.stringify(
    auto.map((c) => ({ id: c.id, verdict: 'duplicate' as const })),
    null,
    1,
  ),
)

if (existsSync(batchDir)) rmSync(batchDir, { recursive: true })
mkdirSync(batchDir, { recursive: true })
for (let i = 0; i < review.length; i += BATCH) {
  const n = String(Math.floor(i / BATCH) + 1).padStart(3, '0')
  writeFileSync(join(batchDir, `${n}.json`), JSON.stringify(review.slice(i, i + BATCH), null, 1))
}
console.log(
  `auto-duplicate: ${auto.length} → auto-decisions.json\nreview: ${review.length} → ${Math.ceil(review.length / BATCH)} batches in dedupe/batches/`,
)

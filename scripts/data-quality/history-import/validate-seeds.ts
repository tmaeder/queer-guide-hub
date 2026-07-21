#!/usr/bin/env npx tsx
// Stage B validator: checks enriched/<chunk>.json files against the
// ENRICHMENT.md output schema + coverage (every raw index referenced).
//
// Usage:
//   npx tsx scripts/data-quality/history-import/validate-seeds.ts            # all chunks
//   npx tsx scripts/data-quality/history-import/validate-seeds.ts <chunk>…   # specific chunk names
//   → exits 1 when any chunk is missing or invalid; prints a per-chunk report.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { z } from 'zod'

const HERE = dirname(fileURLToPath(import.meta.url))
const chunkDir = join(HERE, 'raw', 'chunks')
const enrichedDir = join(HERE, 'enriched')

const DATE_RE = /^\d{4}(-\d{2}){0,2}$/
const CATEGORIES = [
  'uprising-movement',
  'law-equality',
  'law-decriminalization',
  'law-criminalization',
  'depathologization',
  'persecution-destruction',
  'other',
] as const

const skipped = z.object({
  ref: z.string().regex(/^.+:\d+$/),
  skip_reason: z.string().min(3),
})

const enriched = z.object({
  ref: z.string().regex(/^.+:\d+$/),
  title: z.string().min(8).max(90),
  description: z.string().min(30).max(600),
  date: z.string().regex(DATE_RE),
  date_end: z.string().regex(DATE_RE).optional(),
  country_code: z.string().regex(/^([A-Z]{2})?$/),
  country: z.string(),
  city: z.string().optional().default(''),
  region: z.string().optional().default(''),
  category: z.enum(CATEGORIES),
  impact: z.enum(['positive', 'neutral', 'negative']),
  significance: z.number().int().min(1).max(5),
  sources: z.array(z.object({ label: z.string().min(3), url: z.string().url() })).min(1),
  needs_review: z.boolean().optional().default(false),
  skip_reason: z.undefined().optional(),
})

const entrySchema = z.union([skipped, enriched])

// Cheap German-language sniff: enriched descriptions must be English.
const GERMAN_HINTS =
  /\b(und|wird|wurde|nicht|eine[nmr]?|gegründet|schwule[nr]?|zum ersten Mal|Zeitschrift|Verein)\b/

function validateChunk(name: string): string[] {
  const errors: string[] = []
  const chunkPath = join(chunkDir, `${name}.json`)
  const enrichedPath = join(enrichedDir, `${name}.json`)
  if (!existsSync(enrichedPath)) return [`missing enriched/${name}.json`]
  // Direct-extract sources (ext-*) have no fixed raw chunk → schema-only, no
  // coverage check.
  const hasChunk = existsSync(chunkPath)
  const raw: unknown[] = hasChunk ? JSON.parse(readFileSync(chunkPath, 'utf8')) : []
  let out: unknown[]
  try {
    out = JSON.parse(readFileSync(enrichedPath, 'utf8'))
    if (!Array.isArray(out)) return ['enriched file is not a JSON array']
  } catch (e) {
    return [`unparseable JSON: ${(e as Error).message.slice(0, 120)}`]
  }

  const coveredIdx = new Set<number>()
  out.forEach((e, i) => {
    const parsed = entrySchema.safeParse(e)
    if (!parsed.success) {
      errors.push(`[${i}] ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ').slice(0, 200)}`)
      return
    }
    const v = parsed.data
    const m = v.ref.match(/^(.+):(\d+)$/)
    if (!m || m[1] !== name) errors.push(`[${i}] ref '${v.ref}' does not match chunk '${name}'`)
    else coveredIdx.add(Number(m[2]))
    if ('title' in v) {
      if (GERMAN_HINTS.test(v.description) || GERMAN_HINTS.test(v.title))
        errors.push(`[${i}] '${v.ref}' looks German: ${v.title}`)
      const dateYear = Number(v.date.slice(0, 4))
      if (dateYear < 1000 || dateYear > 2026) errors.push(`[${i}] '${v.ref}' year out of range: ${v.date}`)
      if (v.country_code && !v.country) errors.push(`[${i}] '${v.ref}' has code but no country name`)
    }
  })
  for (let i = 0; i < raw.length; i++) {
    if (!coveredIdx.has(i)) errors.push(`raw index ${i} not covered by any output entry`)
  }
  return errors
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const names = requested.length
  ? requested.map((n) => n.replace(/\.json$/, ''))
  : readdirSync(chunkDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()

let failed = 0
let okCount = 0
let totalEntries = 0
let totalSkips = 0
for (const name of names) {
  const errs = validateChunk(name)
  if (errs.length) {
    failed++
    console.log(`✗ ${name}`)
    for (const e of errs.slice(0, 12)) console.log(`    ${e}`)
    if (errs.length > 12) console.log(`    … +${errs.length - 12} more`)
  } else {
    okCount++
    const out = JSON.parse(readFileSync(join(enrichedDir, `${name}.json`), 'utf8')) as any[]
    totalEntries += out.filter((e) => !e.skip_reason).length
    totalSkips += out.filter((e) => e.skip_reason).length
  }
}
console.log(`\n${okCount}/${names.length} chunks valid — ${totalEntries} entries, ${totalSkips} skips`)
process.exit(failed ? 1 : 0)

#!/usr/bin/env npx tsx
// Stage A→B bridge: split raw/*.json into raw/chunks/<source>-NNN.json files of
// ≤50 entries each. Each chunk is one enrichment-subagent work unit; a chunk is
// "done" when enriched/<same-name>.json exists and passes validate-seeds.ts.
//
// Usage: npx tsx scripts/data-quality/history-import/chunk-raw.ts

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHUNK = 50

const rawDir = join(HERE, 'raw')
const chunkDir = join(rawDir, 'chunks')
mkdirSync(chunkDir, { recursive: true })

let total = 0
for (const file of readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort()) {
  const name = file.replace(/\.json$/, '')
  const entries: unknown[] = JSON.parse(readFileSync(join(rawDir, file), 'utf8'))
  for (let i = 0; i < entries.length; i += CHUNK) {
    const n = String(Math.floor(i / CHUNK) + 1).padStart(3, '0')
    writeFileSync(
      join(chunkDir, `${name}-${n}.json`),
      JSON.stringify(entries.slice(i, i + CHUNK), null, 1),
    )
  }
  const chunks = Math.ceil(entries.length / CHUNK)
  console.log(`${name}: ${entries.length} entries → ${chunks} chunks`)
  total += chunks
}
console.log(`Total: ${total} chunk files in raw/chunks/`)

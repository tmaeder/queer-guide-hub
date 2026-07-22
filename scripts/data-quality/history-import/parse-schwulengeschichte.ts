#!/usr/bin/env npx tsx
// Stage A parser: schwulengeschichte.ch Zeittafeln → raw/schwulengeschichte.json
//
// The 7 period pages are static TYPO3 HTML; timeline entries live in
// <dl><dt>YEAR</dt><dd><p>entry…</p></dd>…</dl> blocks. Each <dd> becomes one
// raw entry {source, source_url, year, section, text}.
//
// COPYRIGHT NOTE: the German raw_text extracted here is working material for
// the enrichment stage ONLY — it never enters the seed file or the database.
// Final descriptions are original English prose written from the facts, with
// the source URL cited per entry (schwulengeschichte.ch permits text reuse
// only for private purposes; facts themselves are not copyrightable).
//
// Usage: npx tsx scripts/data-quality/history-import/parse-schwulengeschichte.ts

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'

const PAGES = [
  '1800-1899',
  '1900-1942',
  '1943-1967',
  '1967-1989',
  '1990-1999',
  'ab-2000',
  '2010-2019',
]

interface RawEntry {
  source: 'schwulengeschichte'
  source_url: string
  year: number | null
  section: string
  text: string
}

const clean = (s: string) =>
  s
    .replace(/\u00AD/g, '') // soft hyphens
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim()

async function parsePage(slug: string): Promise<RawEntry[]> {
  const url = `https://schwulengeschichte.ch/zeittafeln/${slug}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const dom = new JSDOM(await res.text())
  const doc = dom.window.document

  const entries: RawEntry[] = []
  for (const dl of doc.querySelectorAll('.ce-bodytext dl')) {
    let year: number | null = null
    for (const node of dl.children) {
      if (node.tagName === 'DT') {
        const y = clean(node.textContent ?? '').match(/^(\d{4})/)
        year = y ? Number(y[1]) : null
      } else if (node.tagName === 'DD') {
        const text = clean(node.textContent ?? '')
        if (text && text !== ' ') {
          entries.push({ source: 'schwulengeschichte', source_url: url, year, section: slug, text })
        }
      }
    }
  }
  return entries
}

async function main() {
  const all: RawEntry[] = []
  for (const slug of PAGES) {
    const entries = await parsePage(slug)
    console.log(`${slug}: ${entries.length} entries`)
    all.push(...entries)
  }
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'raw')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'schwulengeschichte.json'), JSON.stringify(all, null, 1))
  console.log(`Total: ${all.length} raw entries → raw/schwulengeschichte.json`)
  const noYear = all.filter((e) => e.year === null).length
  if (noYear) console.warn(`⚠ ${noYear} entries without a year`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

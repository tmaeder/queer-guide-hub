#!/usr/bin/env npx tsx
// Stage A parser: Wikipedia LGBTQ-history timelines → raw/wp-*.json
//
// Uses the MediaWiki REST HTML endpoint (Parsoid markup, stable structure).
// Walks <section> heading chains (h2 > h3 > h4) and emits one raw entry per
// list item: {source, source_url, year, section, text}. Citation markers and
// [edit] cruft are stripped. Content is CC BY-SA 4.0 — attribution is carried
// into each seed entry's `sources` array during enrichment.
//
// Usage:
//   npx tsx scripts/data-quality/history-import/parse-wikipedia.ts            # all 4 pages
//   npx tsx scripts/data-quality/history-import/parse-wikipedia.ts --page Timeline_of_LGBTQ_history

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'

const PAGES: Record<string, string> = {
  'wp-overview': 'Timeline_of_LGBTQ_history',
  'wp-19th-century': 'LGBTQ_rights_in_the_19th_century',
  'wp-20th-century': 'Timeline_of_LGBTQ_history,_20th_century',
  'wp-21st-century': 'Timeline_of_LGBTQ_history,_21st_century',
}

// Trailing article sections that hold no timeline entries.
const SKIP_SECTIONS =
  /^(see also|references|sources|further reading|external links|notes|bibliography|citations)/i

interface RawEntry {
  source: string
  source_url: string
  year: number | null
  section: string
  text: string
}

const clean = (s: string) =>
  s
    .replace(/\[\d+\]|\[[a-z]\]|\[citation needed\]|\[edit\]/gi, '')
    .replace(/\u00AD|\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Best-effort CE year from heading chain or entry text; null if ambiguous/BC. */
function guessYear(headings: string[], text: string): number | null {
  // BC/BCE anywhere near the front of the text → not representable, leave null
  if (/\b(BC|BCE)\b/.test(text.slice(0, 80))) return null
  const lead = text.match(/^c?\.?\s*(\d{3,4})(?:s)?\b(?![,.]\d)/)
  if (lead) return Number(lead[1])
  for (const h of [...headings].reverse()) {
    if (/\b(BC|BCE)\b/i.test(h)) return null
    const m = h.match(/\b(\d{3,4})(?:s)?\b/)
    if (m) return Number(m[1])
  }
  return null
}

async function parsePage(key: string, title: string): Promise<RawEntry[]> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'queer.guide history import (contact: admin@queer.guide)' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const dom = new JSDOM(await res.text())
  const doc = dom.window.document
  const sourceUrl = `https://en.wikipedia.org/wiki/${title}`

  const entries: RawEntry[] = []
  const headings: string[] = [] // current chain, index 0 = h2
  let pseudoYear: number | null = null // bare <p>2003</p> year markers (21st-century page)

  const walk = (el: Element, liContext: string[]) => {
    for (const node of el.children) {
      const tag = node.tagName
      if (/^H[2-6]$/.test(tag)) {
        const level = Number(tag[1]) - 2
        headings.length = level
        headings[level] = clean(node.textContent ?? '')
        pseudoYear = null
      } else if (tag === 'P') {
        const t = clean(node.textContent ?? '')
        const y = t.match(/^(\d{4})$/)
        if (y) pseudoYear = Number(y[1])
      } else if (tag === 'UL' || tag === 'OL') {
        if (headings[0] && SKIP_SECTIONS.test(headings[0])) continue
        for (const li of node.querySelectorAll(':scope > li')) {
          // Nested lists: take own text minus nested list text, then recurse
          // with the own text as context (category labels like
          // "Same-sex marriage laws: Passed:").
          const nested = li.querySelector('ul, ol')
          let ownText: string
          if (nested) {
            const cloned = li.cloneNode(true) as Element
            cloned.querySelectorAll('ul, ol').forEach((n) => n.remove())
            ownText = clean(cloned.textContent ?? '')
          } else {
            ownText = clean(li.textContent ?? '')
          }
          const isLabelOnly = !!nested && ownText.length < 120 && /[:：]$/.test(ownText)
          if (ownText.length > 15 && !isLabelOnly) {
            entries.push({
              source: key,
              source_url: sourceUrl,
              year: pseudoYear ?? guessYear(headings, ownText),
              section: [...headings.filter(Boolean), ...liContext].join(' › '),
              text: ownText,
            })
          }
          if (nested) walk(li, ownText ? [...liContext, ownText] : liContext)
        }
      } else if (tag === 'SECTION' || tag === 'DIV' || tag === 'BODY') {
        walk(node, liContext)
      }
    }
  }
  walk(doc.body, [])
  return entries
}

async function main() {
  const only = process.argv.includes('--page')
    ? process.argv[process.argv.indexOf('--page') + 1]
    : null
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'raw')
  mkdirSync(outDir, { recursive: true })
  for (const [key, title] of Object.entries(PAGES)) {
    if (only && title !== only && key !== only) continue
    const entries = await parsePage(key, title)
    writeFileSync(join(outDir, `${key}.json`), JSON.stringify(entries, null, 1))
    const noYear = entries.filter((e) => e.year === null).length
    console.log(`${key}: ${entries.length} entries (${noYear} without year) → raw/${key}.json`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

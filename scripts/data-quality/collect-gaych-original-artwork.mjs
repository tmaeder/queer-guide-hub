#!/usr/bin/env node
// Read-only publisher evidence. No application writes or guessed image URLs.
import { readFile, writeFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { evaluateCover } from '../../supabase/functions/_shared/image-probe.ts'
import { gateImages } from '../../supabase/functions/_shared/image-gate.ts'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw Error('Usage: collector native-candidates.json fresh-evidence.json')
try { await readFile(output); throw Error('Retain existing evidence; use a fresh path') } catch (error) { if (error.code !== 'ENOENT') throw error }
const rows = JSON.parse(await readFile(input, 'utf8'))
if (!Array.isArray(rows) || rows.length > 200 || new Set(rows.map(row => row.id)).size !== rows.length) throw Error('At most 200 unique native candidates')
const report = { read_only: true, started_at: new Date().toISOString(), input, complete: false, results: [], proofs: [] }
const hash = value => createHash('sha256').update(value).digest('hex')
const save = async () => { await writeFile(output + '.tmp', JSON.stringify(report, null, 2)); await rename(output + '.tmp', output) }
let nextRequest = 0
async function fetchBytes(url, max, image = false) {
  const slot = Math.max(Date.now(), nextRequest); nextRequest = slot + 3000
  if (slot > Date.now()) await new Promise(resolve => setTimeout(resolve, slot - Date.now()))
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'QueerGuide-OriginalArtworkEvidence/1.0 (+https://queer.guide)' } })
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (response.status !== 200 || !response.body || (image ? !['image/jpeg', 'image/png', 'image/webp'].includes(mime) : !['text/html', 'application/xhtml+xml'].includes(mime))) {
    await response.body?.cancel()
    const error = Error('Source response unavailable or unsupported: ' + response.status)
    error.publisherUnavailable = [429, 503].includes(response.status)
    throw error
  }
  const chunks = []; let total = 0
  for await (const chunk of response.body) { total += chunk.length; if (total > max) throw Error('Source exceeds capture bound'); chunks.push(chunk) }
  return { bytes: Buffer.concat(chunks), mime, status: response.status, url: response.url, observed_at: new Date().toISOString() }
}
await save()
for (let offset = 0; offset < rows.length; offset += 3) {
  const results = await Promise.all(rows.slice(offset, offset + 3).map(async row => {
    try {
      const page = new URL(row.source_url)
      if (page.origin !== 'https://gay.ch' || page.username || page.password || page.search || page.hash || !/^\/parties\/[^/]+$/.test(page.pathname)) throw Error('Only registered gay.ch party detail pages')
      const source = await fetchBytes(page.href, 600_000)
      const html = source.bytes.toString('utf8')
      const evidence = JSON.parse(execFileSync(process.env.GAYCH_DENO_BIN || 'deno',
        ['run', '--no-lock', '--node-modules-dir=none', fileURLToPath(new URL('./select-gaych-original-artwork.ts', import.meta.url))],
        { input: JSON.stringify({ html, event: row, page_url: page.href }), encoding: 'utf8', maxBuffer: 1_000_000 }))
      const url = evidence?.urls.find(value => value.startsWith(page.href + '/@@download/image/'))
      if (!url || url === row.old_image_url || !gateImages([url]).kept.length) return { id: row.id, positive: false, reason: 'no_unambiguous_published_original' }
      const sourceJson = JSON.stringify(evidence.sourceEvent)
      const image = await fetchBytes(url, 12 * 1024 * 1024, true)
      const decoded = await sharp(image.bytes).metadata()
      if ({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[decoded.format] !== image.mime) throw Error('Image format and response MIME disagree')
      const reason = evaluateCover({ width: decoded.width, height: decoded.height, bytes: image.bytes.length }, 'event_artwork')
      if (reason) return { id: row.id, positive: false, reason, width: decoded.width, height: decoded.height }
      const proof = { ...row, url, source_observed_at: source.observed_at, source_final_url: source.url,
        source_http_status: source.status, source_html_sha256: hash(source.bytes),
        source_json_text: sourceJson, source_json_sha256: hash(sourceJson),
        probe: { observed_at: image.observed_at, status: image.status, mime: image.mime, format: decoded.format, width: decoded.width, height: decoded.height, bytes: image.bytes.length, sha256: hash(image.bytes), passed: true },
        contract: 'gaych_published_event_original:v1', human_reviewed: false }
      return { id: row.id, positive: true, proof }
    } catch (error) { return { id: row.id, positive: false, outcome_unknown: true, publisher_unavailable: error.publisherUnavailable === true, error: error.message } }
  }))
  for (const result of results) {
    const { proof, ...receipt } = result
    report.results.push(receipt)
    if (proof) report.proofs.push(proof)
  }
  await save()
  console.log(JSON.stringify({ examined: report.results.length, positive: report.proofs.length }))
  if (results.some(result => result.publisher_unavailable)) {
    report.stop_reason = 'publisher_unavailable'; await save()
    throw Error('Publisher unavailable; retain partial captures and back off before a fresh run')
  }
}
report.complete = true; report.finished_at = new Date().toISOString(); await save()

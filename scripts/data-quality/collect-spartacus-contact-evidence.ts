// Read-only, sequential capture of already registered public detail pages.
import { parse, type DefaultTreeAdapterTypes as Tree } from 'npm:parse5@8.0.1'
import { parseDetailUrl } from '../../supabase/functions/_shared/spartacus-parse.ts'
import { distanceKm } from '../../supabase/functions/_shared/geo-link-guards.ts'

type Node = Tree.Node
type Element = Tree.Element
export type Candidate = { venue_id: string; organization_id: string; source_id: string; source_entity_id: string; expected_payload_hash: string; captured_url: string; name: string; latitude: number; longitude: number; country_code: string; city_id: string; country_id: string }
const norm = (s: string) => s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const attr = (n: Element, k: string) => n.attrs.find(a => a.name === k)?.value ?? ''
const classHas = (n: Element, c: string) => attr(n, 'class').split(/\s+/).includes(c)
function all(n: Node, predicate: (e: Element) => boolean): Element[] {
  const out: Element[] = []
  function visit(node: Node, depth: number) {
    if (depth > 100) return
    if ('tagName' in node && predicate(node)) out.push(node)
    if ('childNodes' in node) node.childNodes.forEach(c => visit(c, depth + 1))
  }
  visit(n, 0)
  return out
}
function text(n: Node): string {
  if ('tagName' in n && (['script','style','template','noscript'].includes(n.tagName)
    || n.attrs.some(a => a.name === 'hidden' || (a.name === 'aria-hidden' && a.value === 'true')))) return ''
  if (n.nodeName === '#text' && 'value' in n) return n.value
  return 'childNodes' in n ? n.childNodes.map(text).join(' ') : ''
}
function publicWebsite(value: string): string | null {
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port
      || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname)
      || /(^|\.)(spartacus\.gayguide\.travel|gayguide\.travel|facebook\.com|instagram\.com|twitter\.com|x\.com|google\.[a-z.]+|bit\.ly|t\.co|linktr\.ee)$/i.test(u.hostname)) return null
    return u.href
  } catch { return null }
}

export function spartacusContactEvidence(c: Candidate, html: string, finalUrl = c.captured_url) {
  if (html.length < 500 || html.length > 400_000 || /^[†‡]/.test(c.name)) return null
  let u: URL
  try { u = new URL(finalUrl) } catch { return null }
  const detail = parseDetailUrl(u.href)
  if (u.origin !== 'https://spartacus.gayguide.travel' || u.search || u.hash || !detail
    || detail.id !== c.source_entity_id || !/^[a-f0-9]{64}$/.test(c.expected_payload_hash)) return null
  const tree = parse(html)
  const canonicals = all(tree, e => e.tagName === 'link' && attr(e, 'rel') === 'canonical')
  if (canonicals.length !== 1 || attr(canonicals[0], 'href') !== u.href) return null
  const entries = all(tree, e => classHas(e, 'entry') && classHas(e, 'hotel'))
  if (entries.length !== 1) return null
  const entry = entries[0]
  if (/permanently closed|closed permanently|no longer exists|dauerhaft geschlossen|definitiv geschlossen/i.test(text(entry))) return null
  const headings = all(entry, e => e.tagName === 'h1')
  if (headings.length !== 1) return null
  const nameLinks = all(headings[0], e => e.tagName === 'a')
  if (nameLinks.length !== 1 || norm(text(nameLinks[0])) !== norm(c.name)) return null
  try {
    const nameUrl = new URL(attr(nameLinks[0], 'href'))
    if (nameUrl.origin !== u.origin || parseDetailUrl(nameUrl.href)?.id !== c.source_entity_id) return null
  } catch { return null }
  // Read only the map inside this entry, never related-place or advertisement maps.
  const scripts = all(entry, e => e.tagName === 'script').map(s => s.childNodes.map(n => n.nodeName === '#text' && 'value' in n ? n.value : '').join('')).join('\n')
  const markers = [...scripts.matchAll(/L\.marker\(\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)]
  if (markers.length !== 1) return null
  const latitude = Number(markers[0][1]), longitude = Number(markers[0][2])
  const distance = distanceKm(c, { latitude, longitude })
  if (distance === null || distance > 0.06) return null
  const addressBlocks = all(entry, e => classHas(e, 'one-third') && all(e, h => h.tagName === 'h2' && text(h).trim() === 'Address').length === 1)
  if (addressBlocks.length !== 1) return null
  const websites = all(addressBlocks[0], e => e.tagName === 'a').map(e => publicWebsite(attr(e, 'href'))).filter((s): s is string => !!s)
  const hosts = new Set(websites.map(s => new URL(s).hostname.replace(/^www\./, '')))
  if (hosts.size !== 1) return null
  const website = websites[0]
  return { ...c, observed_url: u.href, observed_at: new Date().toISOString(), website,
    source_name: text(nameLinks[0]).replace(/\s+/g, ' ').trim(), source_latitude: latitude, source_longitude: longitude,
    address_text: text(addressBlocks[0]).replace(/\s+/g, ' ').trim(), html }
}

if (import.meta.main) {
  const [inputPath, outputPath] = Deno.args
  if (!inputPath || !outputPath) throw new Error('Usage: collector input.json output.json')
  const rows = JSON.parse(await Deno.readTextFile(inputPath)) as Candidate[]
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Bounded native export required')
  const evidence: NonNullable<ReturnType<typeof spartacusContactEvidence>>[] = []
  const receipts: Array<Record<string, unknown>> = []
  let failures = 0
  for (const c of rows) {
    const u = new URL(c.captured_url)
    if (u.origin !== 'https://spartacus.gayguide.travel' || parseDetailUrl(u.href)?.id !== c.source_entity_id) throw new Error('Unregistered detail identity')
    let stop = false
    try {
      const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'QueerGuide-SourceContactEvidence/1.0', 'Accept': 'text/html' } })
      if (r.status === 429 || r.status === 403) stop = true
      let html = ''
      if (r.ok && r.headers.get('content-type')?.includes('text/html') && r.body) {
        const reader = r.body.getReader()
        const chunks: Uint8Array[] = []
        let total = 0
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          total += chunk.value.length
          if (total > 400_000) { await reader.cancel(); break }
          chunks.push(chunk.value)
        }
        if (total <= 400_000) {
          const bytes = new Uint8Array(total)
          let offset = 0
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
          html = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        }
      }
      const match = r.ok ? spartacusContactEvidence(c, html) : null
      if (match) evidence.push(match)
      receipts.push({ venue_id: c.venue_id, http_status: r.status, matched: !!match, source_unknown: !r.ok })
      failures = r.ok ? 0 : failures + 1
    } catch (e) {
      receipts.push({ venue_id: c.venue_id, source_unknown: true, error: String(e) })
      failures++
    }
    await Deno.writeTextFile(outputPath, JSON.stringify({ captured_at: new Date().toISOString(), receipts, evidence }, null, 2))
    console.log(JSON.stringify({ processed: receipts.length, contacts: evidence.length }))
    if (stop || failures >= 2) break
    await new Promise(resolve => setTimeout(resolve, 1100))
  }
}

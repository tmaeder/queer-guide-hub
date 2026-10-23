// Parse an already captured, identity-matched description; no fetch or model.
import { parseFragment, type DefaultTreeAdapterTypes } from 'npm:parse5@8.0.1'
import { text, type GapEvent, type SourceEvidence } from './event-gap-core.ts'

const omitted = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'svg', 'math', 'nav', 'form'])
const blocks = new Set(['p', 'div', 'br', 'li', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'tr'])

export function sourceHtmlDescription(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100_000) return null
  const chunks: string[] = []
  let tooDeep = false
  function walk(node: DefaultTreeAdapterTypes.Node, depth: number): void {
    if (depth > 100) { tooDeep = true; return }
    if ('tagName' in node) {
      if (omitted.has(node.tagName) || node.attrs.some(a => a.name === 'hidden'
        || (a.name === 'aria-hidden' && a.value.toLowerCase() === 'true')
        || (a.name === 'style' && /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(a.value)))) return
      if (blocks.has(node.tagName)) chunks.push('\n')
    }
    if (node.nodeName === '#text' && 'value' in node) chunks.push(node.value)
    if ('childNodes' in node) for (const child of node.childNodes) walk(child, depth + 1)
    if ('tagName' in node && blocks.has(node.tagName)) chunks.push('\n')
  }
  walk(parseFragment(value), 0)
  if (tooDeep) return null
  const output = chunks.join('').replace(/\u00a0/g, ' ').split('\n')
    .map(line => line.replace(/[\t\r ]+/g, ' ').trim()).filter(Boolean).join('\n\n')
  // Do not decode entities a second time or persist reconstructed markup.
  if (output.length < 80 || output.length > 20_000 || /[<>]/.test(output)
    || /accept cookies|cookie policy|sign in to read|subscribe to continue|all rights reserved|privacy policy/i.test(output)) return null
  return output
}

export function storedAgendaqDescription(sources: SourceEvidence[], event: GapEvent): { description: string; source_url: string; source_id?: string; source_payload_hash?: string } | null {
  const provenance = event.field_provenance
  if (provenance && typeof provenance === 'object' && 'description' in provenance) return null
  const start = Date.parse(text(event.start_date))
  if (!Number.isFinite(start) || !text(event.external_id)) return null
  for (const source of sources) {
    const raw = source.raw
    if (source.source_slug !== 'agendaq' || !raw || raw.name !== event.title || raw.slug !== event.external_id
      || source.source_url !== `https://www.agendaq.fr/fr/agenda/${event.external_id}`
      || Date.parse(text(raw.start)) !== start) continue
    if (text(raw.end) || text(event.end_date)) {
      if (Date.parse(text(raw.end)) !== Date.parse(text(event.end_date))) continue
    }
    // Preserve supplied prose unless it is exactly the captured short summary.
    if (text(event.description) && text(event.description) !== text(raw.descShort)) continue
    const description = sourceHtmlDescription(raw.full_description)
    if (description) return { description, source_url: source.source_url,
      source_id: typeof raw.source_id === 'string' ? raw.source_id : undefined,
      source_payload_hash: typeof raw.payload_hash === 'string' ? raw.payload_hash : undefined }
  }
  return null
}

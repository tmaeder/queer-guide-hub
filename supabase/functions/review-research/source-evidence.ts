import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
type Node = Record<string, unknown>
export function eventEvidence(html: string, expectedTitle: string): Node[] {
  const found: Node[] = []
  let visited = 0
  function visit(value: unknown): void {
    if (++visited > 200 || found.length >= 5) return
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (!value || typeof value !== 'object') return
    const node = value as Node
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
    if (types.some(t => typeof t === 'string' && /(?:^|\/)\w*Event$/.test(t)) &&
        typeof node.name === 'string' && normalize(node.name) === normalize(expectedTitle)) {
      // Only event-specific structured facts are retained. HTML never becomes instructions.
      found.push({ name: node.name, startDate: node.startDate, endDate: node.endDate, location: node.location, url: node.url })
    }
    if (node['@graph']) visit(node['@graph'])
  }
  for (const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])) } catch { /* malformed publisher JSON is evidence absence */ }
  }
  return found
}
export async function readEventSource(rawUrl: string, title: string): Promise<Node> {
  let url = assertPublicHttpUrl(rawUrl)
  const signal = AbortSignal.timeout(12000)
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'QueerGuide-ReviewResearch/1.0 (https://queer.guide)', Accept: 'text/html,application/ld+json' } })
    if (response.status >= 300 && response.status < 400) {
      const target = response.headers.get('location')
      await response.body?.cancel()
      if (!target) throw new Error('Source redirect lacks a destination')
      url = assertPublicHttpUrl(new URL(target, url).toString()); continue
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Source returned HTTP ${response.status}`) }
    if (!response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); return { source_url: url, reason: 'Source does not provide an HTML event page' } }
    if (!response.body) throw new Error('Source returned an empty body')
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.length
      if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Source page exceeds the 1 MiB research limit') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const facts = eventEvidence(new TextDecoder().decode(bytes), title)
    return { source_url: url, retrieved_at: new Date().toISOString(), events: facts,
      reason: facts.length ? 'Publisher supplied structured facts for this event' : 'No structured event facts match this event title' }
  }
  throw new Error('Source exceeded the redirect limit')
}

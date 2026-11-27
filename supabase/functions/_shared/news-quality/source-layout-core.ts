export interface NewsSourceLayout { blocks: string[]; noise: string[] }
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

// Keep the current prose. A source can supply boundaries and identify UI text,
// but a changed publisher article must never overwrite our stored wording.
export function applyNewsSourceLayout(current: string, source: NewsSourceLayout): string {
  let body = current
  for (const noise of [...source.noise].sort((a, b) => b.length - a.length)) {
    const needle = flat(noise)
    if (!needle || needle.length < 8) continue
    // Match whitespace flexibly, preserving every other character. A source
    // widget must match in full, with word boundaries, to authorize removal.
    const escaped = needle.split(' ').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    body = body.replace(new RegExp(`(?<![\\p{L}\\p{N}“\"‘'])${escaped}(?![\\p{L}\\p{N}])`, 'gu'), '')
  }
  // Build a whitespace-normalized search index while retaining original offsets.
  const chars: string[] = [], offsets: number[] = []
  for (let i = 0; i < body.length; i++) {
    if (/\s/.test(body[i])) {
      if (chars.length && chars[chars.length - 1] !== ' ') { chars.push(' '); offsets.push(i) }
    } else { chars.push(body[i]); offsets.push(i) }
  }
  const indexed = chars.join('')
  const cuts = new Set<number>()
  let cursor = 0
  for (const block of source.blocks) {
    const text = flat(block)
    if (text.length < 8) continue
    const at = indexed.indexOf(text, cursor)
    if (at < 0 || indexed.indexOf(text, at + 1) >= 0) continue
    const end = at + text.length
    if (at > 0 && indexed[at - 1] !== ' ') continue
    if (end < indexed.length && indexed[end] !== ' ') continue
    cuts.add(offsets[at]); cuts.add(end < offsets.length ? offsets[end] : body.length)
    cursor = end
  }
  for (const cut of [...cuts].sort((a, b) => b - a)) body = body.slice(0, cut) + '\n\n' + body.slice(cut)
  return body.split('\n').map(s => s.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}


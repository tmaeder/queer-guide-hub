import type { Personality } from '../types'
import { getEntry } from './notes'

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Flatten a personality + its local note/tags into a plain string map for CSV.
function toFlatRow(p: Personality): Record<string, string> {
  const local = getEntry(p.id)
  const val = (v: unknown): string => {
    if (v == null) return ''
    if (Array.isArray(v)) return v.join('; ')
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    profession: val(p.profession),
    nationality: val(p.nationality),
    birth_date: val(p.birth_date),
    death_date: val(p.death_date),
    pronouns: val(p.pronouns),
    visibility: val(p.visibility),
    review_status: val(p.review_status),
    needs_attention: val(p.needs_attention),
    wikipedia_url: val(p.wikipedia_url),
    website_url: val(p.website_url),
    tags: val(p.tags),
    lgbti_connection: val(p.lgbti_connection),
    local_note: local.note,
    local_tags: local.tags.join('; '),
  }
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function exportCsv(rows: Personality[]) {
  if (!rows.length) return
  const flat = rows.map(toFlatRow)
  const headers = Object.keys(flat[0])
  const lines = [
    headers.join(','),
    ...flat.map((r) => headers.map((h) => csvEscape(r[h] ?? '')).join(',')),
  ]
  triggerDownload(lines.join('\n'), 'personalities.csv', 'text/csv;charset=utf-8')
}

export function exportJson(rows: Personality[]) {
  const enriched = rows.map((p) => ({ ...p, _local: getEntry(p.id) }))
  triggerDownload(
    JSON.stringify(enriched, null, 2),
    'personalities.json',
    'application/json',
  )
}

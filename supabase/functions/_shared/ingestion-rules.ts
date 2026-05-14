// Pure rule evaluation + action application logic for pipeline-apply-rules.
// Extracted into _shared/ so it can be unit-tested without spinning up Supabase.

export interface RuleMatch {
  platforms?: string[]
  any_of?: string[]
  all_of?: string[]
  regex?: string
}

export interface RuleActions {
  add_labels?: string[]
  set_priority?: number
  set_status?: string
  force_review?: boolean
  set_permission_level?: string
}

export interface Rule {
  id: string
  name: string
  enabled: boolean
  priority: number
  match: RuleMatch
  actions: RuleActions
}

export interface RuleSubmission {
  id: string
  platform: string | null
  status: string | null
  priority: number | null
  labels: string[] | null
  permission_level: string | null
  raw_text: string | null
  ocr_text: string | null
  vision_summary: string | null
  transcript_text: string | null
}

export function combinedText(s: RuleSubmission): string {
  return [s.raw_text, s.ocr_text, s.vision_summary, s.transcript_text]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

export function evaluateRule(
  rule: Rule,
  s: RuleSubmission,
): { matched: boolean; terms: string[] } {
  const m = rule.match || {}
  if (m.platforms?.length && !m.platforms.includes(s.platform || '')) {
    return { matched: false, terms: [] }
  }
  const text = combinedText(s)
  if (!text && (m.any_of?.length || m.all_of?.length || m.regex)) {
    return { matched: false, terms: [] }
  }
  const terms: string[] = []

  if (m.all_of?.length) {
    for (const t of m.all_of) {
      if (!text.includes(t.toLowerCase())) return { matched: false, terms: [] }
      terms.push(t)
    }
  }
  if (m.any_of?.length) {
    const hit = m.any_of.find((t) => text.includes(t.toLowerCase()))
    if (!hit) return { matched: false, terms: [] }
    terms.push(hit)
  }
  if (m.regex) {
    try {
      const re = new RegExp(m.regex, 'i')
      const r = text.match(re)
      if (!r) return { matched: false, terms: [] }
      terms.push(r[0])
    } catch {
      return { matched: false, terms: [] }
    }
  }
  if (!m.platforms?.length && !m.any_of?.length && !m.all_of?.length && !m.regex) {
    return { matched: false, terms: [] }
  }
  return { matched: true, terms }
}

export function applyRuleActions(
  s: RuleSubmission,
  a: RuleActions,
): { patch: Record<string, unknown>; applied: Record<string, unknown> } {
  const patch: Record<string, unknown> = {}
  const applied: Record<string, unknown> = {}

  if (a.add_labels?.length) {
    const existing = new Set(s.labels ?? [])
    const added: string[] = []
    for (const l of a.add_labels) {
      if (!existing.has(l)) {
        existing.add(l)
        added.push(l)
      }
    }
    if (added.length) {
      patch.labels = Array.from(existing)
      applied.added_labels = added
    }
  }
  if (typeof a.set_priority === 'number') {
    const next = Math.max(s.priority ?? 0, a.set_priority)
    if (next !== s.priority) {
      patch.priority = next
      applied.priority = next
    }
  }
  if (a.set_status && a.set_status !== s.status) {
    patch.status = a.set_status
    applied.status = a.set_status
  }
  if (a.force_review && s.status !== 'pending') {
    patch.status = 'pending'
    applied.forced_review = true
  }
  if (a.set_permission_level && a.set_permission_level !== s.permission_level) {
    patch.permission_level = a.set_permission_level
    applied.permission_level = a.set_permission_level
  }

  return { patch, applied }
}

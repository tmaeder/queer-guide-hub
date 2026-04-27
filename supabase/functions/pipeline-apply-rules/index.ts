import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

// ============================================================
// pipeline-apply-rules
// ------------------------------------------------------------
// Pipeline node. Evaluates active ingestion_rules against each
// submission's combined text (raw_text + ocr_text + vision_summary
// + transcript_text). On match: applies actions (labels, priority,
// status, permission, force_review) and writes a hit row.
// ============================================================

interface RuleMatch {
  platforms?: string[]
  any_of?: string[]
  all_of?: string[]
  regex?: string
}

interface RuleActions {
  add_labels?: string[]
  set_priority?: number
  set_status?: string
  force_review?: boolean
  set_permission_level?: string
}

interface Rule {
  id: string
  name: string
  enabled: boolean
  priority: number
  match: RuleMatch
  actions: RuleActions
}

interface Submission {
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

function combinedText(s: Submission): string {
  return [s.raw_text, s.ocr_text, s.vision_summary, s.transcript_text]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

function evaluate(rule: Rule, s: Submission): { matched: boolean; terms: string[] } {
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

function applyActions(s: Submission, a: RuleActions): {
  patch: Record<string, unknown>
  applied: Record<string, unknown>
} {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const submissionIds = Array.isArray(body.submission_ids)
      ? (body.submission_ids as string[])
      : []
    if (submissionIds.length === 0) {
      return jsonResponse({ success: true, processed: 0, hits: 0 }, 200, req)
    }

    const { data: rules, error: rulesErr } = await supabase
      .from('ingestion_rules')
      .select('id, name, enabled, priority, match, actions')
      .eq('enabled', true)
      .order('priority', { ascending: true })
    if (rulesErr) return errorResponse(`rules: ${rulesErr.message}`, 500, req)

    if (!rules?.length) {
      return jsonResponse({ success: true, processed: submissionIds.length, hits: 0 }, 200, req)
    }

    const { data: subs, error: subsErr } = await supabase
      .from('community_submissions')
      .select(
        'id, platform, status, priority, labels, permission_level, raw_text, ocr_text, vision_summary, transcript_text',
      )
      .in('id', submissionIds)
    if (subsErr) return errorResponse(`submissions: ${subsErr.message}`, 500, req)

    let hitCount = 0
    for (const s of (subs ?? []) as Submission[]) {
      let mutated: Submission = { ...s }
      const hits: Array<{
        rule_id: string
        submission_id: string
        matched_terms: { terms: string[] }
        applied_actions: Record<string, unknown>
      }> = []

      for (const rule of rules as Rule[]) {
        const { matched, terms } = evaluate(rule, mutated)
        if (!matched) continue
        const { patch, applied } = applyActions(mutated, rule.actions || {})
        if (Object.keys(patch).length === 0) continue
        const { error: upErr } = await supabase
          .from('community_submissions')
          .update(patch)
          .eq('id', s.id)
        if (upErr) {
          console.error(`apply-rules ${rule.id} on ${s.id}:`, upErr.message)
          continue
        }
        mutated = { ...mutated, ...patch } as Submission
        hits.push({
          rule_id: rule.id,
          submission_id: s.id,
          matched_terms: { terms },
          applied_actions: applied,
        })
      }

      if (hits.length) {
        const { error: hitErr } = await supabase.from('ingestion_rule_hits').insert(hits)
        if (hitErr) console.error('hits insert:', hitErr.message)
        hitCount += hits.length
      }
    }

    return jsonResponse(
      { success: true, processed: subs?.length ?? 0, hits: hitCount },
      200,
      req,
    )
  } catch (err) {
    console.error('pipeline-apply-rules:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})

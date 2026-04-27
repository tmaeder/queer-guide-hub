import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireAdmin,
} from '../_shared/supabase-client.ts'

// ============================================================
// Submission Action — admin endpoint
// ------------------------------------------------------------
// Wraps approve / reject / merge / publish / flag actions on
// community_submissions with admin auth + audit trail. Atomic
// per-action: updates community_submissions and writes one or
// more rows to community_submissions_audit in a single call.
//
// All actions are idempotent on a per-row basis: if the row is
// already in the target state we still write an audit entry but
// skip the table update.
// ============================================================

type Action = 'approve' | 'reject' | 'merge' | 'publish' | 'flag' | 'unflag'

interface ActionRequest {
  submission_id: string
  action: Action
  // approve / reject
  reason?: string
  // merge
  duplicate_of?: string
  // flag
  label?: string
}

const VALID_ACTIONS: Action[] = ['approve', 'reject', 'merge', 'publish', 'flag', 'unflag']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST only', 405, req)

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth
  const actorId = auth.userId === 'service-role' ? null : auth.userId

  let body: ActionRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid JSON', 400, req)
  }

  const { submission_id, action } = body
  if (!submission_id) return errorResponse('submission_id required', 400, req)
  if (!VALID_ACTIONS.includes(action)) return errorResponse(`invalid action: ${action}`, 400, req)

  const { data: row, error: loadErr } = await supabase
    .from('community_submissions')
    .select('id, status, labels, duplicate_of, priority')
    .eq('id', submission_id)
    .single()

  if (loadErr || !row) return errorResponse('submission not found', 404, req)

  const audits: Array<{ field: string; old_value: unknown; new_value: unknown }> = []
  const updates: Record<string, unknown> = {}

  switch (action) {
    case 'approve': {
      if (row.status !== 'approved') {
        updates.status = 'approved'
        updates.reviewed_at = new Date().toISOString()
        audits.push({ field: 'status', old_value: row.status, new_value: 'approved' })
      }
      if (body.reason) {
        audits.push({ field: 'review_note', old_value: null, new_value: body.reason })
      }
      break
    }
    case 'reject': {
      if (row.status !== 'rejected') {
        updates.status = 'rejected'
        updates.reviewed_at = new Date().toISOString()
        audits.push({ field: 'status', old_value: row.status, new_value: 'rejected' })
      }
      if (body.reason) {
        audits.push({ field: 'reject_reason', old_value: null, new_value: body.reason })
      }
      break
    }
    case 'merge': {
      if (!body.duplicate_of) return errorResponse('duplicate_of required for merge', 400, req)
      if (body.duplicate_of === submission_id) {
        return errorResponse('cannot merge a row into itself', 400, req)
      }
      const { data: target } = await supabase
        .from('community_submissions')
        .select('id')
        .eq('id', body.duplicate_of)
        .single()
      if (!target) return errorResponse('duplicate_of target not found', 404, req)

      if (row.duplicate_of !== body.duplicate_of) {
        updates.duplicate_of = body.duplicate_of
        audits.push({
          field: 'duplicate_of',
          old_value: row.duplicate_of,
          new_value: body.duplicate_of,
        })
      }
      if (row.status !== 'duplicate') {
        updates.status = 'duplicate'
        audits.push({ field: 'status', old_value: row.status, new_value: 'duplicate' })
      }
      break
    }
    case 'publish': {
      // Publish is a hint to downstream pipeline-commit. We just flip status
      // to 'approved' (if not already) and add a 'publish_requested' label so
      // the executor picks it up on next tick.
      if (row.status !== 'approved') {
        updates.status = 'approved'
        updates.reviewed_at = new Date().toISOString()
        audits.push({ field: 'status', old_value: row.status, new_value: 'approved' })
      }
      const labels = new Set<string>(Array.isArray(row.labels) ? row.labels : [])
      if (!labels.has('publish_requested')) {
        labels.add('publish_requested')
        updates.labels = Array.from(labels)
        audits.push({
          field: 'labels',
          old_value: row.labels,
          new_value: updates.labels,
        })
      }
      break
    }
    case 'flag': {
      if (!body.label) return errorResponse('label required for flag', 400, req)
      const labels = new Set<string>(Array.isArray(row.labels) ? row.labels : [])
      if (!labels.has(body.label)) {
        labels.add(body.label)
        updates.labels = Array.from(labels)
        audits.push({
          field: 'labels',
          old_value: row.labels,
          new_value: updates.labels,
        })
      }
      break
    }
    case 'unflag': {
      if (!body.label) return errorResponse('label required for unflag', 400, req)
      const labels = new Set<string>(Array.isArray(row.labels) ? row.labels : [])
      if (labels.has(body.label)) {
        labels.delete(body.label)
        updates.labels = Array.from(labels)
        audits.push({
          field: 'labels',
          old_value: row.labels,
          new_value: updates.labels,
        })
      }
      break
    }
  }

  if (Object.keys(updates).length) {
    const { error: updErr } = await supabase
      .from('community_submissions')
      .update(updates)
      .eq('id', submission_id)
    if (updErr) return errorResponse(`update: ${updErr.message}`, 500, req)
  }

  if (audits.length) {
    const auditRows = audits.map((a) => ({
      submission_id,
      actor_id: actorId,
      field: a.field,
      old_value: a.old_value === undefined ? null : a.old_value,
      new_value: a.new_value === undefined ? null : a.new_value,
    }))
    const { error: auditErr } = await supabase
      .from('community_submissions_audit')
      .insert(auditRows)
    if (auditErr) console.error('audit insert failed:', auditErr.message)
  }

  return jsonResponse(
    {
      success: true,
      submission_id,
      action,
      changed: Object.keys(updates).length > 0,
      audits_written: audits.length,
    },
    200,
    req,
  )
})

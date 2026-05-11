import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { sendEmail, isEmailConfigured } from '../_shared/email.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

Deno.serve(withErrorReporting('notify-review-decision', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const submissionId = body.submission_id as string | undefined
    const action = body.action as string | undefined
    const notes = body.notes as string | undefined

    if (!submissionId || !action) {
      return errorResponse('submission_id and action required', 400, req)
    }

    if (!isEmailConfigured()) {
      return jsonResponse({ sent: false, reason: 'email not configured' }, 200, req)
    }

    const { data: submission } = await supabase
      .from('community_submissions')
      .select('id, content_type, data, submitted_by, notify_submitter, status')
      .eq('id', submissionId)
      .maybeSingle()

    if (!submission) {
      return jsonResponse({ sent: false, reason: 'submission not found' }, 200, req)
    }

    if (!submission.notify_submitter) {
      return jsonResponse({ sent: false, reason: 'notify_submitter disabled' }, 200, req)
    }

    const contactEmail = (submission.data as Record<string, unknown>)?.contact_email as string
    if (!contactEmail) {
      return jsonResponse({ sent: false, reason: 'no contact_email' }, 200, req)
    }

    const title = (submission.data as Record<string, unknown>)?.name
      ?? (submission.data as Record<string, unknown>)?.title
      ?? submission.content_type
      ?? 'your submission'

    const statusText = action === 'approve'
      ? 'approved and will be published shortly'
      : 'not accepted at this time'

    const notesBlock = notes
      ? `<p style="margin-top:12px;padding:8px 12px;background:#f5f5f5;border-left:3px solid #333;font-size:14px;">${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : ''

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;color:#333;">
        <p>Hi,</p>
        <p>Your submission <strong>"${String(title).replace(/</g, '&lt;')}"</strong> on queer.guide has been <strong>${statusText}</strong>.</p>
        ${notesBlock}
        <p style="margin-top:16px;font-size:13px;color:#888;">— queer.guide team</p>
      </div>
    `

    const result = await sendEmail({
      from: 'queer.guide <noreply@queer.guide>',
      to: [contactEmail],
      subject: `Submission ${action === 'approve' ? 'approved' : 'update'}: ${String(title).slice(0, 60)}`,
      html,
    })

    return jsonResponse({ sent: !result.error, email_id: result.id, error: result.error }, 200, req)
  } catch (error) {
    console.error('notify-review-decision error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))

// ============================================================
// import-personalities-csv
// Stages CSV rows into ingestion_staging and triggers the
// bulletproof personality-ingestion pipeline. Replaces the
// legacy direct-INSERT path.
// ============================================================

import 'https://deno.land/x/xhr@0.1.0/mod.ts'
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'
import { stagePersonality, triggerPersonalityPipeline, type RawPersonality } from '../_shared/personality-staging.ts'

// Robust RFC 4180-ish CSV parser — handles embedded newlines + escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; continue }
      if (ch === '"') { inQuotes = false; continue }
      field += ch
    } else {
      if (ch === '"') { inQuotes = true; continue }
      if (ch === ',') { row.push(field); field = ''; continue }
      if (ch === '\r') continue
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 0 && r.some(c => c.trim()))
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const autoRun = form.get('auto_run') !== 'false' // default true

    const csvText = await file.text()
    const rows = parseCsv(csvText)
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: 'Empty CSV or missing rows' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const headers = rows[0].map(h => h.trim().toLowerCase())
    if (!headers.includes('name')) {
      return new Response(JSON.stringify({ error: 'Missing required header: name' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const staged: string[] = []
    const updated: string[] = []
    const errors: string[] = []

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i]
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => { obj[h] = (values[idx] ?? '').trim() })

      if (!obj.name) { errors.push(`Row ${i + 1}: missing name`); continue }

      const raw: RawPersonality = {
        name: obj.name,
        description: obj.description || undefined,
        birth_date: obj.birth_date || null,
        death_date: obj.death_date || null,
        is_living: obj.is_living ? obj.is_living.toLowerCase() === 'true' : (obj.death_date ? false : true),
        profession: obj.profession || undefined,
        nationality: obj.nationality || undefined,
        birth_place: obj.birth_place || undefined,
        image_url: obj.image_url || undefined,
        website_url: obj.website_url || undefined,
        pronouns: obj.pronouns || undefined,
        verification_status: obj.verification_status && ['verified','pending','disputed'].includes(obj.verification_status) ? obj.verification_status : 'pending',
        visibility: obj.visibility && ['public','private','draft'].includes(obj.visibility) ? obj.visibility : 'draft',
        is_featured: obj.is_featured ? obj.is_featured.toLowerCase() === 'true' : false,
        fields: obj.fields ? obj.fields.split(',').map(f => f.trim()).filter(Boolean) : undefined,
        wikidata_qid: obj.wikidata_qid || undefined,
        lgbti_connection: obj.lgbti_connection || undefined,
        lgbti_details: obj.lgbti_details || undefined,
      }

      try {
        const res = await stagePersonality(supabase, raw, {
          source_name: 'csv-upload',
          source_type: 'csv',
          source_entity_id: obj.wikidata_qid || null,
          actor: auth.userId,
        })
        if (res.inserted) staged.push(res.staging_id)
        else updated.push(res.staging_id)
      } catch (e) {
        errors.push(`Row ${i + 1} (${obj.name}): ${(e as Error).message}`)
      }
    }

    let pipelineRunId: string | null = null
    let pipelineError: string | undefined
    if (autoRun && (staged.length + updated.length) > 0) {
      const trig = await triggerPersonalityPipeline(supabase, { triggered_by: `csv-import:${auth.userId}` })
      pipelineRunId = trig.pipeline_run_id
      pipelineError = trig.error
    }

    return new Response(JSON.stringify({
      success: true,
      staged: staged.length,
      updated: updated.length,
      total_parsed: rows.length - 1,
      errors: errors.length ? errors : undefined,
      pipeline_run_id: pipelineRunId,
      pipeline_error: pipelineError,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('import-personalities-csv error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } })
  }
})

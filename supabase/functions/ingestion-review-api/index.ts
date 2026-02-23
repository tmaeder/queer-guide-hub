import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify the caller is an admin
async function verifyAdmin(supabase: any, authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const isAdmin = roles?.some((r: { role: string }) => r.role === 'admin')
  if (!isAdmin) throw new Error('Admin access required')

  return user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify admin access
    const authHeader = req.headers.get('Authorization') || ''
    const userId = await verifyAdmin(supabase, authHeader)

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'stats': {
        const { data: stats } = await supabase
          .from('ingestion_staging')
          .select('review_status, target_table, ai_confidence_score')
          .eq('review_status', 'pending_review')

        const byTable: Record<string, number> = {}
        let totalPending = 0
        let avgConfidence = 0

        if (stats) {
          for (const item of stats) {
            totalPending++
            byTable[item.target_table] = (byTable[item.target_table] || 0) + 1
            avgConfidence += parseFloat(item.ai_confidence_score) || 0
          }
          if (totalPending > 0) avgConfidence /= totalPending
        }

        return new Response(JSON.stringify({
          success: true,
          stats: { totalPending, byTable, avgConfidence },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'list': {
        const { filters = {}, page = 0, pageSize = 20 } = body
        let query = supabase
          .from('ingestion_staging')
          .select('*, import_jobs_enhanced!inner(type, source_type)', { count: 'exact' })
          .eq('review_status', 'pending_review')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (filters.target_table) query = query.eq('target_table', filters.target_table)
        if (filters.source_type) query = query.eq('source_type', filters.source_type)
        if (filters.min_confidence) query = query.gte('ai_confidence_score', filters.min_confidence)
        if (filters.max_confidence) query = query.lte('ai_confidence_score', filters.max_confidence)

        const { data, count, error } = await query
        if (error) throw error

        return new Response(JSON.stringify({
          success: true,
          items: data || [],
          total: count || 0,
          page,
          pageSize,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'approve': {
        const { staging_id, notes } = body
        if (!staging_id) throw new Error('staging_id is required')

        const { error } = await supabase
          .from('ingestion_staging')
          .update({
            review_status: 'approved',
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || null,
          })
          .eq('id', staging_id)
          .eq('review_status', 'pending_review')

        if (error) throw error

        // Trigger commit for this item by re-invoking the pipeline
        const { data: item } = await supabase
          .from('ingestion_staging')
          .select('job_id')
          .eq('id', staging_id)
          .single()

        if (item?.job_id) {
          supabase.functions.invoke('ingestion-pipeline', {
            body: { job_id: item.job_id, stage: 'commit' },
          }).catch(() => {})
        }

        return new Response(JSON.stringify({ success: true, action: 'approved', staging_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'reject': {
        const { staging_id, notes } = body
        if (!staging_id) throw new Error('staging_id is required')

        const { error } = await supabase
          .from('ingestion_staging')
          .update({
            review_status: 'rejected',
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || null,
            disposition: 'rejected',
          })
          .eq('id', staging_id)
          .eq('review_status', 'pending_review')

        if (error) throw error

        return new Response(JSON.stringify({ success: true, action: 'rejected', staging_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'bulk_approve': {
        const { staging_ids, notes } = body
        if (!Array.isArray(staging_ids) || staging_ids.length === 0) {
          throw new Error('staging_ids array is required')
        }

        const { error } = await supabase
          .from('ingestion_staging')
          .update({
            review_status: 'approved',
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || 'Bulk approved',
          })
          .in('id', staging_ids)
          .eq('review_status', 'pending_review')

        if (error) throw error

        // Get unique job IDs to trigger commits
        const { data: items } = await supabase
          .from('ingestion_staging')
          .select('job_id')
          .in('id', staging_ids)

        const jobIds = [...new Set((items || []).map((i: { job_id: string }) => i.job_id))]
        for (const jobId of jobIds) {
          supabase.functions.invoke('ingestion-pipeline', {
            body: { job_id: jobId, stage: 'commit' },
          }).catch(() => {})
        }

        return new Response(JSON.stringify({
          success: true,
          action: 'bulk_approved',
          count: staging_ids.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'bulk_reject': {
        const { staging_ids, notes } = body
        if (!Array.isArray(staging_ids) || staging_ids.length === 0) {
          throw new Error('staging_ids array is required')
        }

        const { error } = await supabase
          .from('ingestion_staging')
          .update({
            review_status: 'rejected',
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || 'Bulk rejected',
            disposition: 'rejected',
          })
          .in('id', staging_ids)
          .eq('review_status', 'pending_review')

        if (error) throw error

        return new Response(JSON.stringify({
          success: true,
          action: 'bulk_rejected',
          count: staging_ids.length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (error) {
    console.error('Review API error:', error)
    const status = (error as Error).message?.includes('Unauthorized') || (error as Error).message?.includes('Admin') ? 403 : 500
    return new Response(JSON.stringify({ error: (error as Error).message, success: false }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

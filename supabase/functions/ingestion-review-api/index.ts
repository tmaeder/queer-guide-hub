import { getCorsHeaders, getServiceClient, requireAdmin, errorResponse } from '../_shared/supabase-client.ts'

// Per-target-table commit RPCs. All have signature
// (p_staging_id uuid, p_actor text). Used to skip workflow-executor
// latency on individual reviewer approvals.
const COMMIT_RPC_BY_TARGET: Record<string, string> = {
  venues: 'commit_venue_staging_item',
  events: 'commit_event_staging_item',
  personalities: 'commit_personality_staging_item',
  cities: 'commit_city_staging_item',
  countries: 'commit_country_staging_item',
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth
    const userId = auth.userId

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

        // Log audit + direct-commit for venues via RPC (skips workflow latency).
        await supabase.from('ingestion_events').insert({
          staging_id, stage: 'review', new_status: 'approved',
          actor: 'ingestion-review-api', payload: { user_id: userId, notes },
        })

        const { data: item } = await supabase
          .from('ingestion_staging')
          .select('job_id, target_table')
          .eq('id', staging_id)
          .single()

        let commitResult: unknown = null
        const commitFn = COMMIT_RPC_BY_TARGET[item?.target_table ?? '']
        if (commitFn) {
          const { data, error: rpcErr } = await supabase.rpc(commitFn, {
            p_staging_id: staging_id,
            p_actor: `review:${userId}`,
          })
          if (rpcErr) throw rpcErr
          commitResult = data
        } else if (item?.target_table) {
          // marketplace_listings, news_articles: only batch RPCs exist; commit
          // happens via the regular pipeline cron, not on individual approve.
          console.warn(`[review-api] no per-item commit RPC for target_table=${item.target_table}; relying on batch pipeline cron`)
        }

        return new Response(JSON.stringify({
          success: true, action: 'approved', staging_id, commit: commitResult,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'merge': {
        // Force-merge a staging item INTO a chosen existing venue (used for
        // merge_candidate review outcomes where the reviewer selects the target).
        const { staging_id, target_venue_id, notes } = body
        if (!staging_id || !target_venue_id) {
          throw new Error('staging_id and target_venue_id are required')
        }

        // Override dedup match so commit_venue_staging_item uses the chosen target
        const { error: prepErr } = await supabase
          .from('ingestion_staging')
          .update({
            dedup_status: 'duplicate',
            dedup_match_id: target_venue_id,
            dedup_match_table: 'venues',
            review_status: 'approved',
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes || `Merged into ${target_venue_id}`,
          })
          .eq('id', staging_id)
        if (prepErr) throw prepErr

        const { data, error: rpcErr } = await supabase.rpc('commit_venue_staging_item', {
          p_staging_id: staging_id,
          p_actor: `review-merge:${userId}`,
        })
        if (rpcErr) throw rpcErr

        return new Response(JSON.stringify({
          success: true, action: 'merged', staging_id, target_venue_id, commit: data,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
        if (staging_ids.length > 1000) return errorResponse('Too many IDs', 400, req)

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

        // Per-item commit RPCs by target_table (skips workflow latency).
        // marketplace_listings + news_articles fall through to the regular
        // batch pipeline cron — no per-item RPC exists for those types.
        const { data: items } = await supabase
          .from('ingestion_staging')
          .select('id, target_table')
          .in('id', staging_ids)

        for (const it of items ?? []) {
          const commitFn = COMMIT_RPC_BY_TARGET[(it as { target_table: string }).target_table]
          if (!commitFn) continue
          await supabase.rpc(commitFn, {
            p_staging_id: (it as { id: string }).id,
            p_actor: `review:${userId}`,
          })
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
        if (staging_ids.length > 1000) return errorResponse('Too many IDs', 400, req)

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
    return new Response(JSON.stringify({ error: 'Internal server error', success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

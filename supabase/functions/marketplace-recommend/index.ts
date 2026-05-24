// marketplace-recommend (Phase 3)
//
// Calls the public.recommend_guides(user_id, limit) SQL scorer and returns
// ordered guide rows with boost_reason. Signed-in: passes auth.uid().
// Anon: passes NULL so the scorer falls back to freshness + featured.
//
// See docs/plans/2026-05-24-marketplace-redesign.md §3.

import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

interface RecommendRequest {
  limit?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse('Method not allowed', 405, req)
  }

  try {
    const body = req.method === 'POST'
      ? ((await req.json().catch(() => ({}))) as RecommendRequest)
      : {}
    const limit = Math.min(Math.max(body.limit ?? 10, 1), 30)

    const supabase = getServiceClient()

    // Resolve the caller. With verify_jwt=true, anon clients still pass the
    // anon JWT (no user). Only resolve user_id for real user JWTs.
    let userId: string | null = null
    const authHeader = req.headers.get('Authorization')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '')
      if (token && token !== anonKey && token !== serviceKey) {
        const { data: userData } = await supabase.auth.getUser(token)
        userId = userData?.user?.id ?? null
      }
    }

    const { data, error } = await supabase.rpc('recommend_guides', {
      p_user_id: userId,
      p_limit: limit,
    })
    if (error) return errorResponse(error.message, 500, req)

    const guides = (data ?? []).map((g: Record<string, unknown>) => ({
      id: g.id,
      slug: g.slug,
      title: g.title,
      dek: g.dek,
      hero_image_path: g.hero_image_path,
      category_slug: g.category_slug,
      city_id: g.city_id,
      audience_tags: g.audience_tags,
      reading_time_min: g.reading_time_min,
      pick_count: g.pick_count,
      published_at: g.published_at,
      boost_reason: g.boost_reason ?? null,
    }))
    return jsonResponse(
      { guides, count: guides.length, phase: 3, personalized: userId !== null },
      200,
      req,
    )
  } catch (err) {
    return errorResponse((err as Error).message, 500, req)
  }
})

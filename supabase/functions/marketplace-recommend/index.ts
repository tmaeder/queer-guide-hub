// marketplace-recommend
//
// Returns a personalized stream of marketplace_guides ordered by the §3
// scoring function in docs/plans/2026-05-24-marketplace-redesign.md.
//
// Phase 0 stub: returns an empty array. Phase 3 wires the actual
// `recommend_guides(user_id, limit)` SQL function and exposes the dominant
// boost reason ('home_city' | 'interest' | 'category_affinity' | 'featured'
// | 'continue_reading') for the "Why this guide?" chip.

import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

interface RecommendRequest {
  limit?: number
  // Anonymous IP-geo overrides — passed by /marketplace when geo-resolve
  // has already happened on this navigation. Server still validates.
  city_id?: string | null
  country_code?: string | null
}

interface RecommendedGuide {
  id: string
  slug: string
  title: string
  dek: string | null
  hero_image_path: string | null
  category_slug: string | null
  city_id: string | null
  audience_tags: string[]
  reading_time_min: number | null
  pick_count: number
  published_at: string | null
  // null until the scorer is wired in Phase 3
  boost_reason: 'home_city' | 'interest' | 'category_affinity' | 'featured' | 'continue_reading' | null
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

    // Phase 0: serve only the editorially-featured guides (no personalization).
    // The Phase 3 SQL function `recommend_guides(user_id, limit)` will replace
    // this branch and emit per-row boost_reason for the "Why this guide?" chip.
    const { data, error } = await supabase
      .from('marketplace_guides')
      .select(
        'id, slug, title, dek, hero_image_path, category_slug, city_id, audience_tags, reading_time_min, pick_count, published_at',
      )
      .eq('status', 'published')
      .order('is_featured', { ascending: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) return errorResponse(error.message, 500, req)

    const guides: RecommendedGuide[] = (data ?? []).map((g) => ({
      ...g,
      boost_reason: null,
    }))

    return jsonResponse({ guides, count: guides.length, phase: 0 }, 200, req)
  } catch (err) {
    return errorResponse((err as Error).message, 500, req)
  }
})

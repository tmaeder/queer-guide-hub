import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/supabase-client.ts'

// Algolia has been removed. Use the `search` edge function instead.
// This endpoint returns 410 Gone for backward compatibility signaling.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  return new Response(
    JSON.stringify({
      error: 'Algolia search has been removed. Use the /functions/v1/search endpoint instead.',
      migration: 'POST /functions/v1/search with {query, filters: {types, location, categories, featured, rating}, hitsPerPage}',
    }),
    {
      status: 410,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    }
  )
})

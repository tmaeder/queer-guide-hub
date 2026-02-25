import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Algolia has been removed. Use the `search` edge function instead.
// This endpoint returns 410 Gone for backward compatibility signaling.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: 'Algolia search has been removed. Use the /functions/v1/search endpoint instead.',
      migration: 'POST /functions/v1/search with {query, filters: {types, location, categories, featured, rating}, hitsPerPage}',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})

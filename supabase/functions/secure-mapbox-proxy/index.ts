import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/supabase-client.ts'

/**
 * DEPRECATED: Mapbox has been replaced with self-hosted MapLibre + Protomaps tiles.
 * This endpoint is kept as a 410 Gone stub for backward compatibility.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Mapbox proxy endpoint has been retired. Maps now use self-hosted MapLibre + Protomaps tiles.',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN') || Deno.env.get('MAPBOX_PUBLIC_TOKEN');

    if (!mapboxToken) {
      throw new Error('Mapbox access token not configured (set MAPBOX_ACCESS_TOKEN or MAPBOX_PUBLIC_TOKEN)');
    }

    // Create Supabase client only if service key is available
    let supabase: ReturnType<typeof createClient> | null = null;
    if (supabaseUrl && supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey);
    }

    // For public access, JWT is optional; proceed without user verification
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    try {
      if (authHeader && supabase) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        );
        if (!authError && user) userId = user.id;
      }
    } catch (_) {
      // ignore auth errors for public endpoint
    }

    // Check rate limiting using requester IP when available
    const requesterIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                        req.headers.get('x-real-ip') ||
                        req.headers.get('cf-connecting-ip') ||
                        '0.0.0.0';

    if (supabase) {
      try {
        const { error: rateLimitError } = await supabase.rpc('check_rate_limit', {
          identifier: requesterIp,
          max_attempts: 200,
          time_window_minutes: 60
        });
        // If the RPC exists and explicitly signals an error unrelated to missing function, log it
        if (rateLimitError && !`${rateLimitError.message}`.toLowerCase().includes('function check_rate_limit')) {
          throw new Error('Rate limit exceeded');
        }
      } catch (e) {
        // If rate limit RPC is missing or fails, proceed without blocking but log for observability
        console.warn('Rate limit check skipped:', (e as any)?.message || e);
      }
    }

    // Log security event (best-effort)
    if (supabase) {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'MAPBOX_TOKEN_ACCESS',
        p_user_id: userId,
        p_metadata: {
          timestamp: new Date().toISOString(),
          user_agent: req.headers.get('User-Agent')
        },
        p_severity: 'low'
      });
    }

    return new Response(
      JSON.stringify({ token: mapboxToken }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    );

  } catch (error) {
    console.error('Mapbox token error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: error.message.includes('Rate limit') ? 429 : 
                error.message.includes('Authentication') ? 401 : 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    );
  }
});
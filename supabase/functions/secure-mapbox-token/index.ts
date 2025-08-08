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
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN') || Deno.env.get('MAPBOX_PUBLIC_TOKEN');

    if (!mapboxToken) {
      throw new Error('Mapbox access token not configured (set MAPBOX_ACCESS_TOKEN or MAPBOX_PUBLIC_TOKEN)');
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    // Check rate limiting
    const { error: rateLimitError } = await supabase.rpc('check_rate_limit', {
      identifier: user.id,
      max_attempts: 100,
      time_window_minutes: 60
    });

    if (rateLimitError) {
      throw new Error('Rate limit exceeded');
    }

    // Log security event
    await supabase.rpc('log_enhanced_security_event', {
      p_event_type: 'MAPBOX_TOKEN_ACCESS',
      p_user_id: user.id,
      p_metadata: {
        timestamp: new Date().toISOString(),
        user_agent: req.headers.get('User-Agent')
      },
      p_severity: 'low'
    });

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
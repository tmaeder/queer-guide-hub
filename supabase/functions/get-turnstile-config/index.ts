import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders } from '../_shared/supabase-client.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Rate limiting check
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    '127.0.0.1';

    const { data: rateLimitResult, error: rateLimitError } = await supabase
      .rpc('check_rate_limit', {
        identifier: clientIP,
        max_attempts: 10,
        time_window_minutes: 5
      });

    if (rateLimitError || !rateLimitResult) {
      // Log security event for rate limit exceeded
      await supabase
        .rpc('log_enhanced_security_event', {
          event_type: 'TURNSTILE_CONFIG_RATE_LIMIT',
          user_id: authData.user.id,
          details: {
            ip_address: clientIP,
            timestamp: new Date().toISOString()
          },
          severity: 'medium'
        });

      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const turnstileSiteKey = Deno.env.get('TURNSTILE_SITE_KEY');
    if (!turnstileSiteKey) {
      console.error('TURNSTILE_SITE_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Turnstile not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Log configuration access
    await supabase
      .rpc('log_enhanced_security_event', {
        event_type: 'TURNSTILE_CONFIG_ACCESS',
        user_id: authData.user.id,
        details: {
          ip_address: clientIP,
          user_agent: req.headers.get('user-agent') || 'unknown',
          timestamp: new Date().toISOString()
        },
        severity: 'low'
      });

    return new Response(
      JSON.stringify({ 
        siteKey: turnstileSiteKey,
        version: '1.0'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Turnstile config error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})
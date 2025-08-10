import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:3000',
  'http://localhost:5173',
  'https://queer.guide',
  'https://www.queer.guide'
]);

const getOrigin = (req: Request): string | null => {
  const origin = req.headers.get('Origin');
  if (origin) return origin;
  const referer = req.headers.get('Referer');
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN');

    if (!mapboxToken) {
      throw new Error('Mapbox token not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Origin allowlist enforcement
    const origin = req.headers.get('Origin') || (() => { try { return new URL(req.headers.get('Referer')||'').origin } catch { return null } })();
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'DISALLOWED_ORIGIN_MAPBOX_PROXY',
        p_user_id: null,
        p_metadata: { origin },
        p_severity: 'medium'
      });
      return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional auth; fall back to IP-based access for public visitors
    const authHeader = req.headers.get('Authorization');
    let identifier = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'anonymous';

    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (user?.id) {
        identifier = user.id;
      }
    }


    // Rate limiting (per user if logged in, otherwise per IP)
    const { data: rateLimitCheck } = await supabase.rpc('check_rate_limit', {
      identifier,
      max_attempts: 60,
      time_window_minutes: 15
    });

    if (!rateLimitCheck) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return the secure token for client use
    return new Response(JSON.stringify({ token: mapboxToken }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Mapbox proxy error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
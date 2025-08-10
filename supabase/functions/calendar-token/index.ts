import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user via Authorization: Bearer <JWT>
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limit by user id
    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      identifier: user.id,
      max_attempts: 20,
      time_window_minutes: 60
    });
    if (rlError || allowed === false) {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'RATE_LIMIT_CALENDAR_TOKEN',
        p_user_id: user.id,
        p_metadata: { user_id: user.id },
        p_severity: 'medium'
      });
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Reuse existing non-revoked token if available
    const { data: existing, error: existingErr } = await supabase
      .from('calendar_feed_tokens')
      .select('token')
      .eq('user_id', user.id)
      .eq('revoked', false)
      .maybeSingle();

    let token = existing?.token as string | undefined;

    if (!token) {
      // Generate a secure random token (64 hex chars)
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const { error: insertErr } = await supabase
        .from('calendar_feed_tokens')
        .insert({ user_id: user.id, token });
      if (insertErr) {
        throw insertErr;
      }
    }

    const feedBase = `${supabaseUrl}/functions/v1/calendar-feed`;
    const url = `${feedBase}?token=${token}`;

    return new Response(JSON.stringify({ url, token }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
// Deno Deploy Edge Function: secure-google-maps-key (hardened)
// Returns a Google Maps JavaScript API key stored in Supabase secrets.
// Adds origin checks, rate limiting, and security event logging.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { getCorsHeaders, requireAdmin } from '../_shared/supabase-client.ts';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: cors });
  }

  try {
    // Require authenticated admin
    const authResult = await requireAdmin(req, supabase);
    if (authResult instanceof Response) return authResult;

    // Rate limit by IP
    const ip = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('cf-connecting-ip') ||
               req.headers.get('x-real-ip') ||
               '0.0.0.0');
    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      identifier: ip,
      max_attempts: 60, // max 60 key fetches per 15 minutes per IP
      time_window_minutes: 15
    });
    if (rlError || allowed === false) {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'RATE_LIMIT_GOOGLE_MAPS_KEY',
        p_user_id: null,
        p_metadata: { ip },
        p_severity: 'high'
      });
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    return new Response(JSON.stringify({ key }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    console.error('Error in secure-google-maps-key:', e);
    await supabase.rpc('log_enhanced_security_event', {
      p_event_type: 'ERROR_GOOGLE_MAPS_KEY',
      p_user_id: null,
      p_metadata: { error: 'Internal server error' },
      p_severity: 'high'
    });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
});

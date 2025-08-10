// Deno Deploy Edge Function: secure-google-maps-key (hardened)
// Returns a Google Maps JavaScript API key stored in Supabase secrets.
// Adds origin checks, rate limiting, and security event logging.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Update this allowlist as needed for your deployment domains
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'https://queer.guide',
  'https://www.queer.guide',
]);

function getOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (origin) return origin;
  const referer = req.headers.get('Referer');
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const origin = getOrigin(req);
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'DISALLOWED_ORIGIN_MAPS_KEY',
        p_user_id: null,
        p_metadata: { origin },
        p_severity: 'medium'
      });
      return new Response(JSON.stringify({ error: 'Forbidden origin' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

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
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ key }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    await supabase.rpc('log_enhanced_security_event', {
      p_event_type: 'ERROR_GOOGLE_MAPS_KEY',
      p_user_id: null,
      p_metadata: { error: String(e) },
      p_severity: 'high'
    });
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
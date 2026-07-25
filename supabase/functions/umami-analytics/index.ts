import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts';

const supabase = getServiceClient();

// Daily-rotating, cookieless visitor hash (Umami/Plausible-style):
// sha256(utcDate | ip | userAgent). Distinguishes concurrent visitors for
// sessionization without storing IPs or setting cookies; rotates every UTC
// day so it can't track anyone long-term.
async function visitorHash(ip: string, userAgent: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode(`${day}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function clientIp(req: Request): string {
  // x-qg-ip is set by the first-party /api/track Cloudflare Pages proxy;
  // direct calls fall back to the first x-forwarded-for hop.
  const proxied = req.headers.get('x-qg-ip');
  if (proxied) return proxied;
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || 'unknown';
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    const userAgent = req.headers.get('user-agent') || 'unknown';
    payload.visitor_id = await visitorHash(clientIp(req), userAgent);

    // Country comes from Cloudflare edge geo via the /api/track proxy; absent
    // on direct calls (stored as NULL — honest absence, never a fake default).
    const country = req.headers.get('x-qg-country');
    if (country && /^[A-Z]{2}$/i.test(country)) {
      payload.country = country.toUpperCase();
    }

    const { data, error } = await supabase.rpc('track_umami_event', { payload });

    if (error) {
      console.error('track_umami_event RPC error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (data && data.success === false) {
      console.warn('track_umami_event soft-failed:', data.error);
    }

    return new Response(
      JSON.stringify(data ?? { success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in umami-analytics function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to process analytics event' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

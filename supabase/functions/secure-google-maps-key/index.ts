// Deno Deploy Edge Function: secure-google-maps-key
// Returns a Google Maps JavaScript API key stored in Supabase secrets.
// Ensure you set the secret GOOGLE_MAPS_API_KEY in your project settings.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function cors(res: Response) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  return new Response(res.body, { status: res.status, headers });
}

serve((req) => {
  if (req.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }

  try {
    const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      return cors(new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), { status: 500 }));
    }

    return cors(new Response(JSON.stringify({ key }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }));
  } catch (e) {
    return cors(new Response(JSON.stringify({ error: String(e) }), { status: 500 }));
  }
});
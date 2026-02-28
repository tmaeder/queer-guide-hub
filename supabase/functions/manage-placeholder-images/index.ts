// Deno Deploy Edge Function: manage-placeholder-images
// Provides lightweight placeholder image management: resolve by type or list available files.
// Reads from Storage bucket 'placeholders' if available, otherwise falls back to /placeholder.svg

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts'

const BUCKET = "placeholders";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "resolve";
  const type = (url.searchParams.get("type") || "generic").toLowerCase();

  const supabase = getServiceClient();

  try {
    if (action === "list") {
      const { data: root, error } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
      if (error) {
        // Likely bucket missing or access restricted
        return new Response(
          JSON.stringify({ items: [], note: "Bucket missing or inaccessible; returning empty list." }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 },
        );
      }

      const items = (root || []).map((f) => ({ name: f.name, id: f.id, updated_at: f.updated_at, metadata: f.metadata }));
      return new Response(JSON.stringify({ items }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // Resolve: try common candidate paths in order
    const candidates = [
      `${type}/default.svg`,
      `${type}/default.png`,
      `${type}/default.jpg`,
      `default/${type}.svg`,
      `default/${type}.png`,
      `${type}.svg`,
      `${type}.png`,
    ];

    for (const path of candidates) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      if (!error && data?.signedUrl) {
        return new Response(JSON.stringify({ url: data.signedUrl, path, source: "storage", type }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Fallback to public asset path
    return new Response(JSON.stringify({ url: "/placeholder.svg", source: "public-asset", type }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("manage-placeholder-images error", e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});

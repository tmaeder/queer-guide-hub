import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FirecrawlPage {
  url: string;
  html?: string;
  markdown?: string;
}

interface FirecrawlCrawlResponse {
  success: boolean;
  status?: string;
  completed?: number;
  total?: number;
  creditsUsed?: number;
  expiresAt?: string;
  data?: FirecrawlPage[];
  error?: string;
}

// Extract JSON-LD events from a page's HTML
function extractJsonLdEvents(html: string): any[] {
  try {
    const events: any[] = [];
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
      const jsonText = match[1].trim();
      try {
        const parsed = JSON.parse(jsonText);
        const flatten = (val: any): any[] => Array.isArray(val) ? val.flatMap(flatten) : [val];
        const items = flatten(parsed);
        for (const item of items) {
          const t = item['@type'];
          if (!t) continue;
          const types = Array.isArray(t) ? t : [t];
          if (types.some((x: string) => typeof x === 'string' && x.toLowerCase().includes('event'))) {
            events.push(item);
          }
        }
      } catch (_) {
        // ignore bad JSON blocks
      }
    }
    return events;
  } catch (_) {
    return [];
  }
}

// Map schema.org Event JSON-LD to our events table shape
function mapJsonLdToEvent(e: any) {
  // Dates
  const start = e.startDate || e.start_time || e.start_date;
  const end = e.endDate || e.end_time || e.end_date || null;

  // Location
  const loc = e.location || {};
  const locName = typeof loc === 'string' ? loc : (loc.name || null);
  const addr = typeof loc === 'string' ? null : (loc.address || {});
  const street = addr?.streetAddress || addr?.street_address || null;
  const city = addr?.addressLocality || addr?.city || null;
  const region = addr?.addressRegion || addr?.region || null;
  const country = addr?.addressCountry || addr?.country || null;

  // Offers / Pricing
  const offers = Array.isArray(e.offers) ? e.offers[0] : e.offers;
  const price = offers?.price ? Number(offers.price) : null;
  const isFree = e.isAccessibleForFree === true || (typeof price === 'number' ? price === 0 : false);

  // Images
  const images = Array.isArray(e.image) ? e.image : (e.image ? [e.image] : null);

  // Organizer
  const organizer = typeof e.organizer === 'string' ? e.organizer : (e.organizer?.name || null);

  const title = e.name || e.headline || 'Untitled Event';
  const description = e.description || e.about || null;

  return {
    title,
    description,
    event_type: Array.isArray(e['@type']) ? e['@type'][0] : (e['@type'] || 'event'),
    start_date: start ? new Date(start).toISOString() : new Date().toISOString(),
    end_date: end ? new Date(end).toISOString() : null,
    venue_name: locName,
    address: street,
    city: city || 'Unknown',
    state: region,
    country: typeof country === 'string' ? country : (country?.name || 'US'),
    website: e.url || null,
    ticket_url: offers?.url || e.url || null,
    price_min: price,
    price_max: price,
    is_free: isFree,
    age_restriction: e.ageRestriction || null,
    images,
    organizer_name: organizer,
    organizer_contact: null,
    featured: false,
    status: 'active',
    is_recurring: false,
  };
}

function dedupeEvents(events: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const ev of events) {
    const key = `${(ev.title || '').toLowerCase()}|${ev.start_date}|${(ev.venue_name || ev.city || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ev);
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase service configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!firecrawlApiKey) {
    return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not set in Supabase Function Secrets' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { seeds, limit = 100, dryRun = false } = await req.json();
    if (!seeds || !Array.isArray(seeds) || seeds.length === 0) {
      return new Response(JSON.stringify({ error: 'Provide seeds: string[] of URLs to crawl' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let pages: FirecrawlPage[] = [];
    for (const seed of seeds) {
      const res = await fetch('https://api.firecrawl.dev/v0/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url: seed,
          limit,
          scrapeOptions: { formats: ['html', 'markdown'] },
        }),
      });

      const crawl: FirecrawlCrawlResponse = await res.json();
      if (!res.ok || !crawl.success) {
        console.error('Firecrawl error for seed', seed, crawl);
        continue;
      }
      pages = pages.concat(crawl.data || []);
    }

    // Extract and map events
    const rawEvents: any[] = [];
    for (const p of pages) {
      if (!p.html) continue;
      const found = extractJsonLdEvents(p.html);
      for (const ev of found) {
        rawEvents.push(mapJsonLdToEvent(ev));
      }
    }

    const normalized = dedupeEvents(rawEvents);

    if (dryRun) {
      return new Response(JSON.stringify({
        imported: 0,
        preview_count: normalized.length,
        preview: normalized.slice(0, 50),
        message: `Dry run: extracted ${normalized.length} unique events`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert in chunks
    let inserted = 0;
    const chunkSize = 100;
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const chunk = normalized.slice(i, i + chunkSize);
      const { error } = await supabase.from('events').insert(chunk);
      if (error) {
        console.error('Insert error', error);
      } else {
        inserted += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      imported: inserted,
      total_extracted: normalized.length,
      message: `Imported ${inserted}/${normalized.length} events`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('bulk-scrape-events error', err);
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

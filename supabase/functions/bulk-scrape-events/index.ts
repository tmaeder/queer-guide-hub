import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
import { enrichEventWithAI } from '../_shared/ai-enrichment.ts';
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

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

// Extract JSON-LD events from a page's HTML (supports @graph)
function extractJsonLdEvents(html: string): unknown[] {
  try {
    const events: unknown[] = [];
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
      const jsonText = match[1].trim();
      try {
        const parsed = JSON.parse(jsonText);
        const visit = (node: unknown) => {
          if (!node) return;
          if (Array.isArray(node)) {
            for (const x of node) visit(x);
            return;
          }
          const type = node['@type'];
          if (type) {
            const types = Array.isArray(type) ? type : [type];
            if (types.some((x: string) => typeof x === 'string' && x.toLowerCase().includes('event'))) {
              events.push(node);
            }
          }
          if (node['@graph']) visit(node['@graph']);
          if (node.mainEntity) visit(node.mainEntity);
          if (node.itemListElement) visit(node.itemListElement);
        };
        visit(parsed);
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
function mapJsonLdToEvent(e: unknown) {
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
    event_type: 'other',
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

function dedupeEvents(events: unknown[]) {
  const seen = new Set<string>();
  const out: unknown[] = [];
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
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

  if (!firecrawlApiKey) {
    return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not set in Supabase Function Secrets' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const { seeds, limit = 100, dryRun = false } = await req.json();
    if (!seeds || !Array.isArray(seeds) || seeds.length === 0) {
      return new Response(JSON.stringify({ error: 'Provide seeds: string[] of URLs to crawl' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (seeds.length > 20) {
      return new Response(JSON.stringify({ error: 'Too many seeds. Maximum is 20.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const safeLimit = Math.min(limit || 100, 500);

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
          limit: safeLimit,
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
    const rawEvents: unknown[] = [];
    for (const p of pages) {
      if (!p.html) continue;
      const html = p.html;

      // 1) JSON-LD
      const ld = extractJsonLdEvents(html);
      for (const ev of ld) rawEvents.push(mapJsonLdToEvent(ev));

      // 2) Microdata & RDFa parsing
      try {
        const doc: unknown = new DOMParser().parseFromString(html, 'text/html');
        if (doc) {
          // Microdata: itemscope itemtype*=Event
          const microNodes = doc.querySelectorAll('[itemscope][itemtype*="Event"]');
          for (const node of microNodes) {
            const pick = (prop: string) => {
              const el = node.querySelector(`[itemprop="${prop}"]`) as unknown;
              if (!el) return null;
              const val = (el.getAttribute('content') || el.getAttribute('datetime') || el.textContent || '').trim();
              return val || null;
            };
            const locationEl: unknown = node.querySelector('[itemprop="location"]');
            const locName = locationEl?.querySelector('[itemprop="name"]')?.textContent?.trim() || null;
            const addrEl: unknown = locationEl?.querySelector('[itemprop="address"]');
            const city = addrEl?.querySelector('[itemprop="addressLocality"]')?.textContent?.trim() || null;
            const region = addrEl?.querySelector('[itemprop="addressRegion"]')?.textContent?.trim() || null;
            const country = addrEl?.querySelector('[itemprop="addressCountry"]')?.textContent?.trim() || 'US';

            const e = {
              name: pick('name') || pick('summary'),
              description: pick('description'),
              startDate: pick('startDate') || pick('startTime') || pick('start_date'),
              endDate: pick('endDate') || pick('endTime') || pick('end_date'),
              url: pick('url') || p.url,
              image: pick('image'),
              location: {
                name: locName,
                address: {
                  addressLocality: city,
                  addressRegion: region,
                  addressCountry: country,
                }
              },
              '@type': 'Event'
            };
            if (e.name && e.startDate) rawEvents.push(mapJsonLdToEvent(e));
          }

          // RDFa: typeof~="Event"
          const rdfaNodes = doc.querySelectorAll('[typeof~="Event"]');
          for (const node of rdfaNodes) {
            const prop = (name: string) => (node.getAttribute(`property`) === name ? node.getAttribute('content') : null) || node.querySelector(`[property="${name}"]`)?.getAttribute('content') || node.querySelector(`[property="${name}"]`)?.textContent?.trim() || null;
            const name = prop('name') || prop('headline');
            const start = prop('startDate') || prop('startTime');
            const end = prop('endDate') || prop('endTime');
            const url = prop('url') || p.url;
            const city = prop('addressLocality');
            const region = prop('addressRegion');
            const country = prop('addressCountry') || 'US';
            if (name && start) {
              rawEvents.push(mapJsonLdToEvent({
                name,
                startDate: start,
                endDate: end,
                url,
                location: { name: null, address: { addressLocality: city, addressRegion: region, addressCountry: country } },
                '@type': 'Event'
              }));
            }
          }
        }
      } catch (_e) {
        // DOM parsing failed; ignore
      }
    }

    const normalized = dedupeEvents(rawEvents);

    if (dryRun) {
      return new Response(JSON.stringify({
        imported: 0,
        preview_count: normalized.length,
        preview: normalized.slice(0, 50),
        message: `Dry run: extracted ${normalized.length} unique events`,
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // AI enrichment — enhance events missing descriptions
    for (const event of normalized) {
      if (!event.description) {
        try {
          const aiEnrichment = await enrichEventWithAI(supabase, event)
          if (aiEnrichment) {
            if (aiEnrichment.description) event.description = aiEnrichment.description as string
            if (aiEnrichment.event_type && !event.event_type) event.event_type = aiEnrichment.event_type as string
          }
        } catch (e) { console.warn('AI enrichment skipped:', e) }
      }
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
    }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    console.error('bulk-scrape-events error', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

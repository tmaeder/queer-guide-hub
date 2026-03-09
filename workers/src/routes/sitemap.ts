/**
 * generate-sitemap — Dynamic XML sitemap generated from Supabase REST reads.
 */
import type { Env } from '../types';
import { errorResponse, buildCorsHeaders, getOrigin } from '../cors';
import { supabaseRest } from '../supabase-rest';

interface HasIdAndDate {
  id: string;
  updated_at?: string;
}

export async function handleSitemap(req: Request, env: Env): Promise<Response> {
  const cors = buildCorsHeaders(getOrigin(req), env);

  try {
    const baseUrl = 'https://queer.guide';
    const currentDate = new Date().toISOString().split('T')[0];

    const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
      { loc: `${baseUrl}/`, lastmod: currentDate, changefreq: 'daily', priority: '1.0' },
      { loc: `${baseUrl}/venues`, lastmod: currentDate, changefreq: 'weekly', priority: '0.8' },
      { loc: `${baseUrl}/events`, lastmod: currentDate, changefreq: 'daily', priority: '0.8' },
      { loc: `${baseUrl}/marketplace`, lastmod: currentDate, changefreq: 'weekly', priority: '0.7' },
      { loc: `${baseUrl}/directory`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' },
      { loc: `${baseUrl}/users`, lastmod: currentDate, changefreq: 'monthly', priority: '0.6' },
      { loc: `${baseUrl}/news`, lastmod: currentDate, changefreq: 'daily', priority: '0.7' },
      { loc: `${baseUrl}/groups`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' },
      { loc: `${baseUrl}/feed`, lastmod: currentDate, changefreq: 'daily', priority: '0.7' },
      { loc: `${baseUrl}/personalities`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' },
      { loc: `${baseUrl}/knowledge`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' },
      { loc: `${baseUrl}/blog`, lastmod: currentDate, changefreq: 'weekly', priority: '0.5' },
      { loc: `${baseUrl}/about-hub`, lastmod: currentDate, changefreq: 'yearly', priority: '0.5' },
      { loc: `${baseUrl}/about`, lastmod: currentDate, changefreq: 'yearly', priority: '0.4' },
      { loc: `${baseUrl}/contact`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/legal`, lastmod: currentDate, changefreq: 'yearly', priority: '0.4' },
      { loc: `${baseUrl}/terms`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/privacy`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/accessibility`, lastmod: currentDate, changefreq: 'yearly', priority: '0.4' },
    ];

    // Fetch dynamic content in parallel via Supabase REST
    const [venues, events, personalities, countries, cities] = await Promise.all([
      supabaseRest<HasIdAndDate[]>(env, '/rest/v1/venues?select=id,updated_at&published=eq.true&limit=1000'),
      supabaseRest<HasIdAndDate[]>(env, `/rest/v1/events?select=id,updated_at&end_date=gte.${new Date().toISOString()}&limit=1000`),
      supabaseRest<HasIdAndDate[]>(env, '/rest/v1/personalities?select=id,updated_at&published=eq.true&limit=1000'),
      supabaseRest<HasIdAndDate[]>(env, '/rest/v1/countries?select=id,updated_at&limit=500'),
      supabaseRest<HasIdAndDate[]>(env, '/rest/v1/cities?select=id,updated_at&limit=1000'),
    ]);

    const addUrls = (items: HasIdAndDate[] | null, prefix: string, freq: string, prio: string) => {
      if (!items) return;
      for (const item of items) {
        urls.push({
          loc: `${baseUrl}/${prefix}/${item.id}`,
          lastmod: item.updated_at ? new Date(item.updated_at).toISOString().split('T')[0] : currentDate,
          changefreq: freq,
          priority: prio,
        });
      }
    };

    addUrls(venues.data, 'venues', 'weekly', '0.6');
    addUrls(events.data, 'events', 'daily', '0.7');
    addUrls(personalities.data, 'personalities', 'weekly', '0.5');
    addUrls(countries.data, 'countries', 'monthly', '0.5');
    addUrls(cities.data, 'cities', 'monthly', '0.5');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    return new Response(xml, {
      headers: {
        ...cors,
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Sitemap error:', err);
    return errorResponse('Failed to generate sitemap', 500, req, env);
  }
}

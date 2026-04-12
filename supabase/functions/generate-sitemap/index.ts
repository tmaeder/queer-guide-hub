import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders } from '../_shared/supabase-client.ts'

interface SitemapUrl {
  loc: string
  lastmod: string
  changefreq: string
  priority: string
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const baseUrl = 'https://queer.guide'
    const currentDate = new Date().toISOString().split('T')[0]
    
    const urls: SitemapUrl[] = [
      // Static pages
      { loc: `${baseUrl}/`, lastmod: currentDate, changefreq: 'daily', priority: '1.0' },
      { loc: `${baseUrl}/venues`, lastmod: currentDate, changefreq: 'weekly', priority: '0.8' },
      { loc: `${baseUrl}/events`, lastmod: currentDate, changefreq: 'daily', priority: '0.8' },
      { loc: `${baseUrl}/marketplace`, lastmod: currentDate, changefreq: 'weekly', priority: '0.7' },
      { loc: `${baseUrl}/directory`, lastmod: currentDate, changefreq: 'monthly', priority: '0.7' },
      { loc: `${baseUrl}/users`, lastmod: currentDate, changefreq: 'monthly', priority: '0.6' },
      { loc: `${baseUrl}/news`, lastmod: currentDate, changefreq: 'daily', priority: '0.7' },
      { loc: `${baseUrl}/groups`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' },
      { loc: `${baseUrl}/my-groups`, lastmod: currentDate, changefreq: 'weekly', priority: '0.5' },
      { loc: `${baseUrl}/feed`, lastmod: currentDate, changefreq: 'daily', priority: '0.7' },
      { loc: `${baseUrl}/favorites`, lastmod: currentDate, changefreq: 'weekly', priority: '0.5' },
      { loc: `${baseUrl}/search`, lastmod: currentDate, changefreq: 'daily', priority: '0.4' },
      { loc: `${baseUrl}/personalities`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' },
      { loc: `${baseUrl}/knowledge`, lastmod: currentDate, changefreq: 'weekly', priority: '0.6' },
      { loc: `${baseUrl}/about-hub`, lastmod: currentDate, changefreq: 'yearly', priority: '0.5' },
      { loc: `${baseUrl}/about`, lastmod: currentDate, changefreq: 'yearly', priority: '0.4' },
      { loc: `${baseUrl}/contact`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/vision`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/values`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/press`, lastmod: currentDate, changefreq: 'monthly', priority: '0.4' },
      { loc: `${baseUrl}/blog`, lastmod: currentDate, changefreq: 'weekly', priority: '0.5' },
      { loc: `${baseUrl}/sustainability`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/legal`, lastmod: currentDate, changefreq: 'yearly', priority: '0.4' },
      { loc: `${baseUrl}/terms`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/privacy`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/cookies`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/dmca`, lastmod: currentDate, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/accessibility`, lastmod: currentDate, changefreq: 'yearly', priority: '0.4' },
      { loc: `${baseUrl}/auth`, lastmod: currentDate, changefreq: 'yearly', priority: '0.2' },
      { loc: `${baseUrl}/sitemap`, lastmod: currentDate, changefreq: 'monthly', priority: '0.2' },
    ]

    // Fetch dynamic content
    const [venuesResult, eventsResult, personalitiesResult, countriesResult, citiesResult] = await Promise.all([
      supabase
        .from('venues')
        .select('id, updated_at')
        .eq('published', true)
        .limit(1000),
      
      supabase
        .from('events')
        .select('id, updated_at')
        .gte('end_date', new Date().toISOString())
        .limit(1000),
      
      supabase
        .from('personalities')
        .select('id, updated_at')
        .eq('published', true)
        .limit(1000),
      
      supabase
        .from('countries')
        .select('id, updated_at')
        .limit(500),
      
      supabase
        .from('cities')
        .select('id, updated_at')
        .limit(1000)
    ])

    // Add venue pages
    if (venuesResult.data) {
      venuesResult.data.forEach(venue => {
        urls.push({
          loc: `${baseUrl}/venues/${venue.id}`,
          lastmod: venue.updated_at ? new Date(venue.updated_at).toISOString().split('T')[0] : currentDate,
          changefreq: 'weekly',
          priority: '0.6'
        })
      })
    }

    // Add event pages
    if (eventsResult.data) {
      eventsResult.data.forEach(event => {
        urls.push({
          loc: `${baseUrl}/events/${event.id}`,
          lastmod: event.updated_at ? new Date(event.updated_at).toISOString().split('T')[0] : currentDate,
          changefreq: 'daily',
          priority: '0.7'
        })
      })
    }

    // Add personality pages
    if (personalitiesResult.data) {
      personalitiesResult.data.forEach(personality => {
        urls.push({
          loc: `${baseUrl}/personalities/${personality.id}`,
          lastmod: personality.updated_at ? new Date(personality.updated_at).toISOString().split('T')[0] : currentDate,
          changefreq: 'weekly',
          priority: '0.5'
        })
      })
    }

    // Add country pages
    if (countriesResult.data) {
      countriesResult.data.forEach(country => {
        urls.push({
          loc: `${baseUrl}/countries/${country.id}`,
          lastmod: country.updated_at ? new Date(country.updated_at).toISOString().split('T')[0] : currentDate,
          changefreq: 'monthly',
          priority: '0.5'
        })
      })
    }

    // Add city pages
    if (citiesResult.data) {
      citiesResult.data.forEach(city => {
        urls.push({
          loc: `${baseUrl}/cities/${city.id}`,
          lastmod: city.updated_at ? new Date(city.updated_at).toISOString().split('T')[0] : currentDate,
          changefreq: 'monthly',
          priority: '0.5'
        })
      })
    }

    // Generate XML sitemap
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`

    console.log(`Generated sitemap with ${urls.length} URLs`)

    return new Response(xmlContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })

  } catch (error) {
    console.error('Error generating sitemap:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate sitemap' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
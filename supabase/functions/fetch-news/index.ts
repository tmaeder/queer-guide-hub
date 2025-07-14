import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewsArticle {
  title: string;
  content?: string;
  excerpt?: string;
  url: string;
  image_url?: string;
  author?: string;
  published_at: string;
  category: string;
  tags: string[];
  source_id: string;
  country_ids?: string[];
  city_ids?: string[];
}

// Enhanced keyword extraction to generate tags with geo-detection
function extractTags(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase();
  const lgbtqKeywords = [
    'lgbt', 'lgbtq', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer',
    'pride', 'rainbow', 'equality', 'rights', 'discrimination', 'marriage',
    'community', 'activism', 'advocate', 'inclusive', 'diversity', 'trans',
    'non-binary', 'pansexual', 'asexual', 'intersex', 'homophobia', 'transphobia',
    'coming out', 'drag', 'pronouns', 'gender identity', 'sexual orientation',
    'same-sex', 'civil union', 'adoption', 'healthcare', 'sports', 'legislation',
    'hate crime', 'conversion therapy', 'workplace', 'military', 'school'
  ];
  
  return lgbtqKeywords.filter(keyword => text.includes(keyword));
}

// Extract geographic information from article text
async function extractGeoInfo(title: string, content: string, sourceUrl: string, supabaseClient: any) {
  const text = `${title} ${content}`.toLowerCase();
  
  // Country mappings based on source domains
  const countryMappings: { [key: string]: string[] } = {
    'theguardian.com': ['united kingdom', 'uk', 'britain'],
    'washingtonblade.com': ['united states', 'usa', 'america'],
    'buzzfeed.com': ['united states', 'usa', 'america'],
    'reddit.com': ['united states', 'usa', 'america'],
    'thepinknews.com': ['united kingdom', 'uk', 'britain'],
    'sfgate.com': ['united states', 'usa', 'america'],
    'oii.org.au': ['australia'],
    'lgbtqnation.com': ['united states', 'usa', 'america'],
    'outsports.com': ['united states', 'usa', 'america'],
    'ilga-europe.org': ['europe'],
    'tgeu.org': ['europe'],
    'ilga.org': ['international'],
    'eur-lex.europa.eu': ['european union', 'europe'],
    'queerty.com': ['united states', 'usa', 'america'],
    'out.com': ['united states', 'usa', 'america']
  };
  
  // Extract source-based country
  let sourceCountries: string[] = [];
  for (const [domain, countries] of Object.entries(countryMappings)) {
    if (sourceUrl.includes(domain)) {
      sourceCountries = countries;
      break;
    }
  }
  
  // Look for country and city names in the database
  const { data: countries } = await supabaseClient
    .from('countries')
    .select('id, name, code');
    
  const { data: cities } = await supabaseClient
    .from('cities')
    .select('id, name, country_id');
  
  const detectedCountryIds: string[] = [];
  const detectedCityIds: string[] = [];
  
  // Match countries from text and source
  if (countries) {
    for (const country of countries) {
      const countryName = country.name.toLowerCase();
      if (text.includes(countryName) || sourceCountries.some(sc => sc.includes(countryName))) {
        detectedCountryIds.push(country.id);
      }
    }
  }
  
  // Match cities from text
  if (cities) {
    for (const city of cities) {
      const cityName = city.name.toLowerCase();
      if (text.includes(cityName)) {
        detectedCityIds.push(city.id);
      }
    }
  }
  
  return {
    country_ids: detectedCountryIds.slice(0, 3), // Limit to 3 countries
    city_ids: detectedCityIds.slice(0, 3) // Limit to 3 cities
  };
}

// RSS Feed parser
async function parseRSSFeed(url: string, sourceId: string, category: string, supabaseClient: any): Promise<NewsArticle[]> {
  try {
    // Validate URL to prevent SSRF attacks
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    
    // Prevent access to internal/private networks
    const hostname = urlObj.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || 
        hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
        hostname.startsWith('172.')) {
      throw new Error('Access to internal networks not allowed');
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LovableNewsBot/1.0'
      },
      // Add timeout and size limits
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // Simple RSS parsing (in production, you'd use a proper XML parser)
    const items = text.split('<item>').slice(1);
    const articles: NewsArticle[] = [];
    
    for (const item of items.slice(0, 10)) { // Limit to 10 articles per feed
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const authorMatch = item.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>|<author>(.*?)<\/author>/);
      
      if (titleMatch && linkMatch) {
        // Sanitize extracted data to prevent XSS
        const title = (titleMatch[1] || titleMatch[2] || '').replace(/<[^>]*>/g, '').trim();
        const url = (linkMatch[1] || '').trim();
        const description = (descMatch ? (descMatch[1] || descMatch[2]) : '').replace(/<[^>]*>/g, '').trim();
        const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
        const author = authorMatch ? (authorMatch[1] || authorMatch[2] || '').replace(/<[^>]*>/g, '').trim() : undefined;
        
        // Extract image URL from multiple sources
        let imageUrl = null;
        
        // Try to find image in enclosure tag (common in RSS)
        const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]*)"[^>]*type="image[^"]*"/);
        if (enclosureMatch) {
          imageUrl = enclosureMatch[1];
        }
        
        // Try to find image in media:content tag
        if (!imageUrl) {
          const mediaContentMatch = item.match(/<media:content[^>]*url="([^"]*)"[^>]*medium="image"/);
          if (mediaContentMatch) {
            imageUrl = mediaContentMatch[1];
          }
        }
        
        // Try to find image in content or description
        if (!imageUrl) {
          const imgTagMatch = description.match(/<img[^>]*src="([^"]*)"[^>]*>/);
          if (imgTagMatch) {
            imageUrl = imgTagMatch[1];
          }
        }
        
        // Try to find image in media:thumbnail
        if (!imageUrl) {
          const mediaThumbnailMatch = item.match(/<media:thumbnail[^>]*url="([^"]*)"[^>]*>/);
          if (mediaThumbnailMatch) {
            imageUrl = mediaThumbnailMatch[1];
          }
        }
        
        // Validate URL
        try {
          new URL(url);
        } catch {
          continue; // Skip invalid URLs
        }
        
        // Generate enhanced tags and geo info
        const tags = extractTags(title, description);
        const geoInfo = await extractGeoInfo(title, description, url, supabaseClient);
        
        articles.push({
          title: title.trim(),
          content: description.trim(),
          excerpt: description.trim().slice(0, 300) + '...',
          url: url.trim(),
          image_url: imageUrl,
          author,
          published_at: new Date(pubDate).toISOString(),
          category,
          tags,
          source_id: sourceId,
          country_ids: geoInfo.country_ids,
          city_ids: geoInfo.city_ids
        });
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    return [];
  }
}

// News API fetcher
async function fetchFromNewsAPI(apiKey: string, sourceId: string, category: string): Promise<NewsArticle[]> {
  try {
    const query = 'LGBTQ OR LGBT OR gay OR lesbian OR transgender OR queer OR pride';
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=20`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.articles) {
      for (const article of data.articles) {
        if (article.title && article.url) {
          const content = (article.title + ' ' + (article.description || '')).toLowerCase();
          const lgbtqKeywords = [
            'lgbtq', 'lgbt', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'pride',
            'rainbow', 'equality', 'rights', 'discrimination', 'marriage', 'adoption'
          ];
          
          const tags = lgbtqKeywords.filter(keyword => content.includes(keyword));
          
          articles.push({
            title: article.title,
            content: article.content,
            excerpt: article.description,
            url: article.url,
            image_url: article.urlToImage,
            author: article.author,
            published_at: article.publishedAt,
            category,
            tags,
            source_id: sourceId
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching from News API:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get active news sources
    const { data: sources, error: sourcesError } = await supabaseClient
      .from('news_sources')
      .select('*')
      .eq('is_active', true);

    if (sourcesError) {
      throw sourcesError;
    }

    let allArticles: NewsArticle[] = [];

    // Fetch from each source
    for (const source of sources || []) {
      let articles: NewsArticle[] = [];
      
      if (source.source_type === 'rss') {
        articles = await parseRSSFeed(source.url, source.id, source.category, supabaseClient);
      } else if (source.source_type === 'api' && source.name === 'NewsAPI') {
        const apiKey = Deno.env.get("NEWS_API_KEY");
        if (apiKey) {
          articles = await fetchFromNewsAPI(apiKey, source.id, source.category);
        }
      }
      
      allArticles = [...allArticles, ...articles];
      
      // Update last fetched timestamp
      await supabaseClient
        .from('news_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', source.id);
    }

    // Insert articles (ignore duplicates)
    if (allArticles.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('news_articles')
        .upsert(allArticles, { 
          onConflict: 'url',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error('Error inserting articles:', insertError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        articlesProcessed: allArticles.length,
        sources: sources?.length || 0
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in fetch-news function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
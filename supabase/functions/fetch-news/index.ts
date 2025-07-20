import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Extract LGBTQ-related keywords from content
function extractTags(title: string, content: string): string[] {
  const lgbtqKeywords = [
    'lgbtq', 'lgbt', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'pride',
    'rainbow', 'equality', 'rights', 'discrimination', 'marriage', 'adoption',
    'intersex', 'sexual orientation', 'gender identity', 'same-sex', 'homosexual',
    'coming out', 'drag', 'trans', 'non-binary', 'genderfluid'
  ];
  
  const text = (title + ' ' + content).toLowerCase();
  return lgbtqKeywords.filter(keyword => text.includes(keyword));
}

// Standardize tags against centralized tags table
async function standardizeTags(extractedTags: string[], supabaseClient: any): Promise<string[]> {
  if (extractedTags.length === 0) return [];
  
  try {
    const { data: tags, error } = await supabaseClient
      .from('unified_tags')
      .select('id, name')
      .in('name', extractedTags);
    
    if (error) {
      console.error('Error fetching standardized tags:', error);
      return extractedTags;
    }
    
    return tags?.map((tag: any) => tag.name) || extractedTags;
  } catch (error) {
    console.error('Error standardizing tags:', error);
    return extractedTags;
  }
}

// Extract geographic information from content
async function extractGeoInfo(title: string, content: string, sourceUrl: string, supabaseClient: any) {
  const text = (title + ' ' + content + ' ' + sourceUrl).toLowerCase();
  const countryIds: string[] = [];
  const cityIds: string[] = [];
  
  try {
    // Check for country mentions
    const { data: countries } = await supabaseClient
      .from('countries')
      .select('id, name, code');
    
    if (countries) {
      for (const country of countries) {
        if (text.includes(country.name.toLowerCase()) || text.includes(country.code.toLowerCase())) {
          countryIds.push(country.id);
        }
      }
    }
    
    // Check for city mentions
    const { data: cities } = await supabaseClient
      .from('cities')
      .select('id, name');
    
    if (cities) {
      for (const city of cities) {
        if (text.includes(city.name.toLowerCase())) {
          cityIds.push(city.id);
        }
      }
    }
  } catch (error) {
    console.error('Error extracting geo info:', error);
  }
  
  return { countryIds, cityIds };
}

// RSS Feed parser
async function parseRSSFeed(url: string, sourceId: string, category: string, supabaseClient: any): Promise<NewsArticle[]> {
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
    
    if (xmlDoc.querySelector('parsererror')) {
      throw new Error('Invalid XML format');
    }
    
    const items = xmlDoc.querySelectorAll('item, entry');
    const articles: NewsArticle[] = [];
    
    for (const item of items) {
      const titleEl = item.querySelector('title');
      const linkEl = item.querySelector('link');
      const descEl = item.querySelector('description, summary');
      const contentEl = item.querySelector('content\\:encoded, content');
      const authorEl = item.querySelector('author, dc\\:creator');
      const pubDateEl = item.querySelector('pubDate, published, updated');
      
      if (!titleEl?.textContent || !linkEl?.textContent) continue;
      
      const title = titleEl.textContent.trim();
      const url = linkEl.textContent.trim();
      const description = descEl?.textContent?.trim() || '';
      const content = contentEl?.textContent?.trim() || description;
      const author = authorEl?.textContent?.trim();
      
      let publishedAt = new Date().toISOString();
      if (pubDateEl?.textContent) {
        const parsedDate = new Date(pubDateEl.textContent.trim());
        if (!isNaN(parsedDate.getTime())) {
          publishedAt = parsedDate.toISOString();
        }
      }
      
      // XSS prevention
      const sanitizedTitle = title.replace(/<[^>]*>/g, '');
      const sanitizedContent = content.replace(/<[^>]*>/g, '');
      const sanitizedDescription = description.replace(/<[^>]*>/g, '');
      
      // Extract tags
      const extractedTags = extractTags(sanitizedTitle, sanitizedContent);
      const tags = await standardizeTags(extractedTags, supabaseClient);
      
      // Extract geographic info
      const { countryIds, cityIds } = await extractGeoInfo(sanitizedTitle, sanitizedContent, url, supabaseClient);
      
      // Extract image
      let imageUrl = '';
      const mediaContentEl = item.querySelector('media\\:content, enclosure[type^="image"]');
      if (mediaContentEl) {
        imageUrl = mediaContentEl.getAttribute('url') || '';
      }
      
      articles.push({
        title: sanitizedTitle,
        content: sanitizedContent,
        excerpt: sanitizedDescription,
        url: url,
        image_url: imageUrl,
        author: author,
        published_at: publishedAt,
        category,
        tags,
        source_id: sourceId,
        country_ids: countryIds,
        city_ids: cityIds
      });
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
    const query = 'LGBT OR gay OR lesbian OR bisexual OR intersex OR transgender OR "sexual orientation"';
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=50`;
    
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

// NewsData.io fetcher
async function fetchFromNewsData(apiKey: string, sourceId: string, category: string): Promise<NewsArticle[]> {
  try {
    const keywords = ['LGBT', 'Gay', 'Lesbian', 'Bisexual', 'Intersex', 'Transgender', 'Sexual Orientation'];
    const query = keywords.join(' OR ');
    const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=en&size=50`;
    
    const response = await fetch(url);
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.results) {
      for (const article of data.results) {
        if (article.title && article.link) {
          const content = (article.title + ' ' + (article.description || '') + ' ' + (article.content || '')).toLowerCase();
          const lgbtKeywords = ['lgbt', 'gay', 'lesbian', 'bisexual', 'intersex', 'transgender', 'sexual orientation', 'queer', 'pride'];
          
          const tags = lgbtKeywords.filter(keyword => content.includes(keyword.toLowerCase()));
          
          articles.push({
            title: article.title,
            content: article.content,
            excerpt: article.description,
            url: article.link,
            image_url: article.image_url,
            author: article.source_id,
            published_at: article.pubDate,
            category,
            tags,
            source_id: sourceId
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching from NewsData.io:', error);
    return [];
  }
}

// GNews.io fetcher
async function fetchFromGNews(apiKey: string, sourceId: string, category: string): Promise<NewsArticle[]> {
  try {
    const keywords = ['LGBT', 'Gay', 'Lesbian', 'Bisexual', 'Intersex', 'Transgender', 'Sexual Orientation'];
    const query = keywords.join(' OR ');
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=50&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.articles) {
      for (const article of data.articles) {
        if (article.title && article.url) {
          const content = (article.title + ' ' + (article.description || '') + ' ' + (article.content || '')).toLowerCase();
          const lgbtKeywords = ['lgbt', 'gay', 'lesbian', 'bisexual', 'intersex', 'transgender', 'sexual orientation', 'queer', 'pride'];
          
          const tags = lgbtKeywords.filter(keyword => content.includes(keyword.toLowerCase()));
          
          articles.push({
            title: article.title,
            content: article.content,
            excerpt: article.description,
            url: article.url,
            image_url: article.image,
            author: article.source?.name,
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
    console.error('Error fetching from GNews.io:', error);
    return [];
  }
}

// TheNewsAPI.com fetcher
async function fetchFromTheNewsAPI(apiKey: string, sourceId: string, category: string): Promise<NewsArticle[]> {
  try {
    const keywords = ['LGBT', 'Gay', 'Lesbian', 'Bisexual', 'Intersex', 'Transgender', 'Sexual Orientation'];
    const query = keywords.join(' OR ');
    const url = `https://api.thenewsapi.com/v1/news/all?api_token=${apiKey}&search=${encodeURIComponent(query)}&language=en&limit=50`;
    
    const response = await fetch(url);
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.data) {
      for (const article of data.data) {
        if (article.title && article.url) {
          const content = (article.title + ' ' + (article.description || '') + ' ' + (article.snippet || '')).toLowerCase();
          const lgbtKeywords = ['lgbt', 'gay', 'lesbian', 'bisexual', 'intersex', 'transgender', 'sexual orientation', 'queer', 'pride'];
          
          const tags = lgbtKeywords.filter(keyword => content.includes(keyword.toLowerCase()));
          
          articles.push({
            title: article.title,
            content: article.snippet,
            excerpt: article.description,
            url: article.url,
            image_url: article.image_url,
            author: article.source,
            published_at: article.published_at,
            category,
            tags,
            source_id: sourceId
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching from TheNewsAPI.com:', error);
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
      let sourceStatus = 'success';
      let sourceError = null;
      
      try {
        if (source.source_type === 'rss') {
          articles = await parseRSSFeed(source.url, source.id, source.category, supabaseClient);
        } else if (source.source_type === 'api' && source.name === 'NewsAPI.org') {
          const apiKey = Deno.env.get("NEWS_API_KEY");
          if (apiKey) {
            articles = await fetchFromNewsAPI(apiKey, source.id, source.category);
          } else {
            sourceStatus = 'error';
            sourceError = 'Missing NEWS_API_KEY';
          }
        } else if (source.source_type === 'api' && source.name === 'NewsData.io') {
          const apiKey = Deno.env.get("NEWSDATA_API_KEY");
          if (apiKey) {
            articles = await fetchFromNewsData(apiKey, source.id, source.category);
          } else {
            sourceStatus = 'error';
            sourceError = 'Missing NEWSDATA_API_KEY';
          }
        } else if (source.source_type === 'api' && source.name === 'GNews.io') {
          const apiKey = Deno.env.get("GNEWS_API_KEY");
          if (apiKey) {
            articles = await fetchFromGNews(apiKey, source.id, source.category);
          } else {
            sourceStatus = 'error';
            sourceError = 'Missing GNEWS_API_KEY';
          }
        } else if (source.source_type === 'api' && source.name === 'TheNewsAPI.com') {
          const apiKey = Deno.env.get("THENEWSAPI_API_KEY");
          if (apiKey) {
            articles = await fetchFromTheNewsAPI(apiKey, source.id, source.category);
          } else {
            sourceStatus = 'error';
            sourceError = 'Missing THENEWSAPI_API_KEY';
          }
        }
      } catch (error) {
        console.error(`Error fetching from ${source.name}:`, error);
        sourceStatus = 'error';
        sourceError = error.message || 'Unknown error occurred';
      }
      
      allArticles = [...allArticles, ...articles];
      
      // Update source status, error, and timestamp
      await supabaseClient
        .from('news_sources')
        .update({ 
          last_fetched_at: new Date().toISOString(),
          status: sourceStatus,
          last_error: sourceError,
          articles_fetched: articles.length
        })
        .eq('id', source.id);
    }

    // Insert articles (ignore duplicates)
    if (allArticles.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('news_articles')
        .insert(allArticles)
        .select();

      if (insertError) {
        console.error('Error inserting articles:', insertError);
      }
    }

    console.log(`Successfully processed ${allArticles.length} articles from ${sources?.length || 0} sources`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        articlesProcessed: allArticles.length,
        sourcesProcessed: sources?.length || 0
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
// CORS headers for web app compatibility
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define interfaces
interface NewsArticle {
  title: string;
  content: string;
  excerpt: string;
  url: string;
  image_url?: string;
  author?: string;
  published_at: string;
  tags?: string[];
  country_ids?: string[];
  city_ids?: string[];
  source_id: string;
}

// Auto-apply tags by matching keywords
async function autoApplyTags(title: string, content: string, supabaseClient: any): Promise<string[]> {
  try {
    const { data: tags } = await supabaseClient
      .from('unified_tags')
      .select('name')
      .eq('is_active', true);

    const matchedTags: string[] = [];
    const text = `${title} ${content}`.toLowerCase();
    
    if (tags) {
      for (const tag of tags) {
        // Simple keyword matching - can be enhanced with NLP
        const tagKeywords = tag.name.toLowerCase().split(/[\s-_]+/);
        if (tagKeywords.some(keyword => text.includes(keyword))) {
          matchedTags.push(tag.name);
        }
      }
    }
    
    // Add some default LGBTQ+ related tags based on common keywords
    const lgbtKeywords = ['lgbt', 'lgbtq', 'gay', 'lesbian', 'trans', 'transgender', 'bisexual', 'queer', 'pride', 'rainbow'];
    for (const keyword of lgbtKeywords) {
      if (text.includes(keyword) && !matchedTags.includes('LGBTQ+')) {
        matchedTags.push('LGBTQ+');
        break;
      }
    }
    
    return matchedTags.slice(0, 5); // Limit to 5 tags
  } catch (error) {
    console.error('Error applying tags:', error);
    return [];
  }
}

// Extract geographic information from article content
async function extractGeoInfo(title: string, content: string, sourceUrl: string, supabaseClient: any) {
  const countryIds: string[] = [];
  const cityIds: string[] = [];
  
  try {
    const text = `${title} ${content}`.toLowerCase();
    
    // Check for country mentions
    const { data: countries } = await supabaseClient
      .from('countries')
      .select('id, name');
    
    if (countries) {
      for (const country of countries) {
        if (text.includes(country.name.toLowerCase())) {
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

// Simple XML/RSS parser using regex (Deno-compatible)
async function parseRSSFeed(url: string, sourceId: string, supabaseClient: any): Promise<NewsArticle[]> {
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
    const articles: NewsArticle[] = [];
    
    // Extract items using regex (works in Deno without DOMParser)
    const itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || 
                       xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi) || [];
    
    for (const itemXml of itemMatches.slice(0, 10)) { // Limit to 10 articles per feed
      try {
        // Extract title
        const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/is);
        const title = titleMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
        
        // Extract link
        const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/is) ||
                         itemXml.match(/<link[^>]*href=["'](.*?)["'][^>]*>/is);
        const url = linkMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
        
        // Extract description
        const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/is) ||
                         itemXml.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/is);
        const description = descMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>|<[^>]*>/g, '').trim() || '';
        
        // Extract content
        const contentMatch = itemXml.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/is) ||
                            itemXml.match(/<content[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content>/is);
        const content = contentMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>|<[^>]*>/g, '').trim() || description;
        
        // Extract author
        const authorMatch = itemXml.match(/<author[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/author>/is) ||
                           itemXml.match(/<dc:creator[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/dc:creator>/is);
        const author = authorMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        
        // Extract publication date
        const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/is) ||
                            itemXml.match(/<published[^>]*>(.*?)<\/published>/is) ||
                            itemXml.match(/<updated[^>]*>(.*?)<\/updated>/is);
        const pubDateStr = pubDateMatch?.[1]?.trim() || '';
        
        if (!title || !url) continue;
        
        let publishedAt = new Date().toISOString();
        if (pubDateStr) {
          try {
            const parsedDate = new Date(pubDateStr);
            if (!isNaN(parsedDate.getTime())) {
              publishedAt = parsedDate.toISOString();
            }
          } catch {
            // Keep default date
          }
        }
        
        // Extract geo info and tags
        const { countryIds, cityIds } = await extractGeoInfo(title, content, url, supabaseClient);
        const tags = await autoApplyTags(title, content, supabaseClient);
        
        articles.push({
          title,
          content,
          excerpt: description,
          url,
          author,
          published_at: publishedAt,
          tags,
          country_ids: countryIds,
          city_ids: cityIds,
          source_id: sourceId
        });
      } catch (itemError) {
        console.error('Error parsing RSS item:', itemError);
        continue;
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    throw error;
  }
}

// Fetch from NewsAPI.org
async function fetchFromNewsAPI(apiKey: string, sourceId: string, supabaseClient: any): Promise<NewsArticle[]> {
  try {
    const response = await fetch(`https://newsapi.org/v2/everything?q=LGBT OR LGBTQ OR queer OR gay OR lesbian OR transgender&language=en&sortBy=publishedAt&pageSize=10`, {
      headers: {
        'X-API-Key': apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status}`);
    }
    
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.articles && Array.isArray(data.articles)) {
      for (const article of data.articles.slice(0, 10)) {
        if (article.title && article.url) {
          const tags = await autoApplyTags(article.title, article.content || '', supabaseClient);
          const { countryIds, cityIds } = await extractGeoInfo(article.title, article.content || '', article.url, supabaseClient);
          
          articles.push({
            title: article.title,
            content: article.content || article.description || '',
            excerpt: article.description || '',
            url: article.url,
            image_url: article.urlToImage,
            author: article.author,
            published_at: article.publishedAt || new Date().toISOString(),
            tags,
            country_ids: countryIds,
            city_ids: cityIds,
            source_id: sourceId
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching from NewsAPI:', error);
    return [];
  }
}

// Fetch from NewsData.io
async function fetchFromNewsData(apiKey: string, sourceId: string, supabaseClient: any): Promise<NewsArticle[]> {
  try {
    const response = await fetch(`https://newsdata.io/api/1/news?apikey=${apiKey}&q=LGBT OR LGBTQ&language=en&size=10`);
    
    if (!response.ok) {
      throw new Error(`NewsData error: ${response.status}`);
    }
    
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.results && Array.isArray(data.results)) {
      for (const article of data.results.slice(0, 10)) {
        if (article.title && article.link) {
          const tags = await autoApplyTags(article.title, article.content || '', supabaseClient);
          const { countryIds, cityIds } = await extractGeoInfo(article.title, article.content || '', article.link, supabaseClient);
          
          articles.push({
            title: article.title,
            content: article.content || article.description || '',
            excerpt: article.description || '',
            url: article.link,
            image_url: article.image_url,
            author: article.creator?.[0],
            published_at: article.pubDate || new Date().toISOString(),
            tags,
            country_ids: countryIds,
            city_ids: cityIds,
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

// Fetch from GNews.io
async function fetchFromGNews(apiKey: string, sourceId: string, supabaseClient: any): Promise<NewsArticle[]> {
  try {
    const response = await fetch(`https://gnews.io/api/v4/search?q=LGBT OR LGBTQ&lang=en&max=10&apikey=${apiKey}`);
    
    if (!response.ok) {
      throw new Error(`GNews error: ${response.status}`);
    }
    
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.articles && Array.isArray(data.articles)) {
      for (const article of data.articles.slice(0, 10)) {
        if (article.title && article.url) {
          const tags = await autoApplyTags(article.title, article.content || '', supabaseClient);
          const { countryIds, cityIds } = await extractGeoInfo(article.title, article.content || '', article.url, supabaseClient);
          
          articles.push({
            title: article.title,
            content: article.content || article.description || '',
            excerpt: article.description || '',
            url: article.url,
            image_url: article.image,
            author: article.source?.name,
            published_at: article.publishedAt || new Date().toISOString(),
            tags,
            country_ids: countryIds,
            city_ids: cityIds,
            source_id: sourceId
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching from GNews:', error);
    return [];
  }
}

// Fetch from TheNewsAPI.com
async function fetchFromTheNewsAPI(apiKey: string, sourceId: string, supabaseClient: any): Promise<NewsArticle[]> {
  try {
    const response = await fetch(`https://api.thenewsapi.com/v1/news/all?api_token=${apiKey}&search=LGBT OR LGBTQ&language=en&limit=10`);
    
    if (!response.ok) {
      throw new Error(`TheNewsAPI error: ${response.status}`);
    }
    
    const data = await response.json();
    const articles: NewsArticle[] = [];
    
    if (data.data && Array.isArray(data.data)) {
      for (const article of data.data.slice(0, 10)) {
        if (article.title && article.url) {
          const tags = await autoApplyTags(article.title, article.description || '', supabaseClient);
          const { countryIds, cityIds } = await extractGeoInfo(article.title, article.description || '', article.url, supabaseClient);
          
          articles.push({
            title: article.title,
            content: article.description || '',
            excerpt: article.snippet || '',
            url: article.url,
            image_url: article.image_url,
            author: article.source,
            published_at: article.published_at || new Date().toISOString(),
            tags,
            country_ids: countryIds,
            city_ids: cityIds,
            source_id: sourceId
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching from TheNewsAPI:', error);
    return [];
  }
}

// Main Edge Function
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting news fetch process...');

    // Get active news sources
    const { data: sources, error: sourcesError } = await supabase
      .from('news_sources')
      .select('*')
      .eq('is_active', true);

    if (sourcesError) {
      throw sourcesError;
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active news sources found', processed_articles: 0, processed_sources: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalArticles = 0;
    let processedSources = 0;

    // Process each source
    for (const source of sources) {
      try {
        let articles: NewsArticle[] = [];
        
        // Update source status to processing
        await supabase
          .from('news_sources')
          .update({ 
            last_fetch_at: new Date().toISOString(),
            status: 'processing'
          })
          .eq('id', source.id);

        // Fetch articles based on source type
        if (source.type === 'rss' && source.url) {
          articles = await parseRSSFeed(source.url, source.id, supabase);
        } else if (source.type === 'api') {
          // Get API keys from environment
          const newsApiKey = Deno.env.get('NEWS_API_KEY');
          const newsdataApiKey = Deno.env.get('NEWSDATA_API_KEY');
          const gnewsApiKey = Deno.env.get('GNEWS_API_KEY');
          const thenewsApiKey = Deno.env.get('THENEWSAPI_API_KEY');

          if (source.api_endpoint?.includes('newsapi.org') && newsApiKey) {
            articles = await fetchFromNewsAPI(newsApiKey, source.id, supabase);
          } else if (source.api_endpoint?.includes('newsdata.io') && newsdataApiKey) {
            articles = await fetchFromNewsData(newsdataApiKey, source.id, supabase);
          } else if (source.api_endpoint?.includes('gnews.io') && gnewsApiKey) {
            articles = await fetchFromGNews(gnewsApiKey, source.id, supabase);
          } else if (source.api_endpoint?.includes('thenewsapi.com') && thenewsApiKey) {
            articles = await fetchFromTheNewsAPI(thenewsApiKey, source.id, supabase);
          }
        }

        if (articles.length > 0) {
          // Insert articles into database
          const { error: insertError } = await supabase
            .from('news_articles')
            .upsert(
              articles.map(article => ({
                title: article.title,
                content: article.content,
                excerpt: article.excerpt,
                url: article.url,
                image_url: article.image_url,
                author: article.author,
                published_at: article.published_at,
                source_id: article.source_id,
                views_count: 0,
                featured: false
              })),
              { onConflict: 'url' }
            );

          if (insertError) {
            console.error('Error inserting articles:', insertError);
          } else {
            totalArticles += articles.length;
            
            // Create tag assignments for each article
            for (const article of articles) {
              if (article.tags && article.tags.length > 0) {
                const { data: insertedArticle } = await supabase
                  .from('news_articles')
                  .select('id')
                  .eq('url', article.url)
                  .single();

                if (insertedArticle) {
                  for (const tagName of article.tags) {
                    const { data: tag } = await supabase
                      .from('unified_tags')
                      .select('id')
                      .eq('name', tagName)
                      .single();

                    if (tag) {
                      await supabase
                        .from('unified_tag_assignments')
                        .upsert({
                          entity_id: insertedArticle.id,
                          entity_type: 'news_article',
                          tag_id: tag.id
                        }, { onConflict: 'entity_id,tag_id' });
                    }
                  }
                }
              }
            }
          }
        }

        // Update source status
        await supabase
          .from('news_sources')
          .update({ 
            status: 'active',
            error_message: null,
            last_successful_fetch: new Date().toISOString()
          })
          .eq('id', source.id);

        processedSources++;

      } catch (sourceError) {
        console.error(`Error processing source ${source.name}:`, sourceError);
        
        // Update source with error
        await supabase
          .from('news_sources')
          .update({ 
            status: 'error',
            error_message: sourceError.message
          })
          .eq('id', source.id);
      }
    }

    console.log(`Successfully processed ${totalArticles} articles from ${processedSources} sources`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed ${totalArticles} articles from ${processedSources} sources`,
        processed_articles: totalArticles,
        processed_sources: processedSources
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in news fetch function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        processed_articles: 0,
        processed_sources: 0
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

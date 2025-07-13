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
}

// RSS Feed parser
async function parseRSSFeed(url: string, sourceId: string, category: string): Promise<NewsArticle[]> {
  try {
    const response = await fetch(url);
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
        const title = titleMatch[1] || titleMatch[2];
        const url = linkMatch[1];
        const description = descMatch ? (descMatch[1] || descMatch[2]) : '';
        const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
        const author = authorMatch ? (authorMatch[1] || authorMatch[2]) : undefined;
        
        // Generate tags based on LGBTQ+ keywords
        const lgbtqKeywords = [
          'lgbtq', 'lgbt', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'pride',
          'rainbow', 'equality', 'rights', 'discrimination', 'marriage', 'adoption',
          'healthcare', 'transition', 'pronoun', 'identity', 'orientation', 'community'
        ];
        
        const content = (title + ' ' + description).toLowerCase();
        const tags = lgbtqKeywords.filter(keyword => content.includes(keyword));
        
        articles.push({
          title: title.trim(),
          content: description.trim(),
          excerpt: description.trim().slice(0, 300) + '...',
          url: url.trim(),
          author,
          published_at: new Date(pubDate).toISOString(),
          category,
          tags,
          source_id: sourceId
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
        articles = await parseRSSFeed(source.url, source.id, source.category);
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
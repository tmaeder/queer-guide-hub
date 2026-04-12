import { getCorsHeaders, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts';

const VALID_LANGS = new Set(['en','fr','de','es','pt','it','nl','ja','zh','ko','ar','ru','pl','sv','fi','da','no','hu','cs','ro','bg','hr','sk','sl','et','lv','lt','el','tr','he','th','vi','id','ms','tl','uk','be','sr','mk','sq','bs','mt','ga','cy','eu','ca','gl']);

interface WikipediaData {
  title: string;
  extract: string;
  description: string;
  content: string;
  pageUrl: string;
  thumbnail?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

interface WikipediaRequest {
  query: string;
  type?: 'city' | 'country';
  entityId?: string;
  batchMode?: boolean;
  language?: string;
}

async function fetchWikipediaSummary(query: string, language = 'en'): Promise<unknown> {
  const summaryUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  
  console.log('Fetching Wikipedia summary from:', summaryUrl);
  
  const response = await fetch(summaryUrl, {
    headers: {
      'User-Agent': 'Queer-Guide-App/1.0',
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Wikipedia summary API error: ${response.status} - ${response.statusText}`);
  }
  
  return await response.json();
}

async function fetchWikipediaContent(query: string, language = 'en'): Promise<string> {
  try {
    const contentUrl = `https://${language}.wikipedia.org/api/rest_v1/page/mobile-sections/${encodeURIComponent(query)}`;
    
    console.log('Fetching Wikipedia content from:', contentUrl);
    
    const response = await fetch(contentUrl, {
      headers: {
        'User-Agent': 'Queer-Guide-App/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log('Content API failed, using summary only');
      return '';
    }
    
    const contentData = await response.json();
    
    if (contentData.mobileview && contentData.mobileview.sections) {
      const introSections = contentData.mobileview.sections
        .filter((section: unknown) => section.level <= 2 && section.text)
        .slice(0, 3);
        
      return introSections
        .map((section: unknown) => section.text)
        .join(' ')
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .substring(0, 2000); // Limit length
    }
    
    return '';
  } catch (error) {
    console.log('Error fetching detailed content:', error);
    return '';
  }
}

async function searchWikipediaData(query: string, language = 'en'): Promise<WikipediaData> {
  console.log('Searching Wikipedia for:', { query, language });
  
  // Try exact match first
  let summaryData;
  try {
    summaryData = await fetchWikipediaSummary(query, language);
  } catch (_error) {
    // If exact match fails, try search API
    console.log('Exact match failed, trying search API...');
    
    const searchUrl = `https://${language}.wikipedia.org/api/rest_v1/page/search/${encodeURIComponent(query)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Queer-Guide-App/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!searchResponse.ok) {
      throw new Error(`Wikipedia search API error: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.pages || searchData.pages.length === 0) {
      throw new Error(`No Wikipedia pages found for: ${query}`);
    }
    
    // Use the first search result
    const firstResult = searchData.pages[0];
    summaryData = await fetchWikipediaSummary(firstResult.title, language);
  }
  
  // Get detailed content
  const detailedContent = await fetchWikipediaContent(summaryData.title, language);
  
  const result: WikipediaData = {
    title: summaryData.title,
    extract: summaryData.extract || '',
    description: summaryData.description || '',
    content: detailedContent || summaryData.extract || '',
    pageUrl: summaryData.content_urls?.desktop?.page || '',
    thumbnail: summaryData.thumbnail?.source,
    coordinates: summaryData.coordinates ? {
      lat: summaryData.coordinates.lat,
      lon: summaryData.coordinates.lon
    } : undefined
  };
  
  console.log('Wikipedia data fetched successfully for:', query);
  return result;
}

async function updateEntityWithWikipediaData(
  supabase: unknown, 
  entityType: 'city' | 'country', 
  entityId: string, 
  wikipediaData: WikipediaData
) {
  const updateData = {
    description: wikipediaData.content || wikipediaData.extract,
    wikipedia_url: wikipediaData.pageUrl,
    wikipedia_extract: wikipediaData.extract,
    updated_at: new Date().toISOString()
  };
  
  // Add coordinates for cities if available
  if (entityType === 'city' && wikipediaData.coordinates) {
    updateData.latitude = wikipediaData.coordinates.lat;
    updateData.longitude = wikipediaData.coordinates.lon;
  }
  
  const tableName = entityType === 'city' ? 'cities' : 'countries';
  
  console.log(`Updating ${entityType} ${entityId} with Wikipedia data`);
  
  const { error } = await supabase
    .from(tableName)
    .update(updateData)
    .eq('id', entityId);
  
  if (error) {
    throw new Error(`Failed to update ${entityType}: ${error.message}`);
  }
  
  return updateData;
}

async function processSingleEntity(
  supabase: unknown,
  query: string,
  entityType?: 'city' | 'country',
  entityId?: string,
  language = 'en'
) {
  console.log('Processing single entity:', { query, entityType, entityId, language });
  
  const wikipediaData = await searchWikipediaData(query, language);
  
  let updateResult = null;
  if (entityType && entityId) {
    updateResult = await updateEntityWithWikipediaData(supabase, entityType, entityId, wikipediaData);
  }
  
  return {
    success: true,
    query,
    wikipediaData,
    updated: !!updateResult,
    updateData: updateResult
  };
}

async function processBatchMode(supabase: unknown, entityType: 'city' | 'country', language = 'en') {
  console.log(`Starting batch mode for ${entityType}s...`);
  
  const tableName = entityType === 'city' ? 'cities' : 'countries';
  const selectFields = entityType === 'city' 
    ? 'id, name, countries(name)' 
    : 'id, name';
  
  const { data: entities, error } = await supabase
    .from(tableName)
    .select(selectFields)
    .or('description.is.null,wikipedia_url.is.null')
    .limit(20); // Process in small batches to avoid timeouts
  
  if (error) {
    throw new Error(`Failed to fetch ${entityType}s: ${error.message}`);
  }
  
  if (!entities || entities.length === 0) {
    return {
      success: true,
      message: `No ${entityType}s found that need Wikipedia data`,
      processed: 0
    };
  }
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (const entity of entities) {
    try {
      const query = entityType === 'city' && entity.countries
        ? `${entity.name}, ${entity.countries.name}`
        : entity.name;
      
      const result = await processSingleEntity(
        supabase,
        query,
        entityType,
        entity.id,
        language
      );
      
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      results.push({
        entityId: entity.id,
        entityName: entity.name,
        ...result
      });
      
      // Add delay to respect Wikipedia's rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error processing ${entityType} ${entity.name}:`, error);
      errorCount++;
      results.push({
        entityId: entity.id,
        entityName: entity.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return {
    success: true,
    message: `Batch processing completed: ${successCount} successful, ${errorCount} errors`,
    processed: entities.length,
    successCount,
    errorCount,
    results
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();

    const authResult = await requireAdmin(req, supabase);
    if (authResult instanceof Response) return authResult;

    const requestData: WikipediaRequest = await req.json().catch(() => ({}));
    const { query, type, entityId, batchMode } = requestData;
    let { language = 'en' } = requestData;

    if (!VALID_LANGS.has(language)) language = 'en';

    if (!query && !batchMode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Query parameter is required for single entity processing'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Wikipedia data fetch request:', { query, type, entityId, batchMode, language });
    
    let result;
    
    if (batchMode) {
      if (!type) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Type (city or country) is required for batch mode' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      
      result = await processBatchMode(supabase, type, language);
    } else {
      result = await processSingleEntity(supabase, query, type, entityId, language);
    }
    
    return new Response(
      JSON.stringify({
        ...result,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 400
      }
    );

  } catch (error) {
    console.error('Error in fetch-wikipedia-data function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to fetch Wikipedia data',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
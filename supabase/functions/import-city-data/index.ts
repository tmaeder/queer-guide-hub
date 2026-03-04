import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CityDataImportRequest {
  action: 'fetch_images' | 'fetch_wikipedia' | 'fetch_all';
  cityIds?: string[];
  batchSize?: number;
  language?: string;
}

async function initializeSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function callEdgeFunction(functionName: string, params: any = {}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL not configured');
  }
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(params),
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Edge function ${functionName} failed: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}

async function getCitiesForProcessing(supabase: any, cityIds?: string[], action = 'fetch_all') {
  let query = supabase
    .from('cities')
    .select('id, name, countries(name)')
    .order('name');
  
  if (cityIds && cityIds.length > 0) {
    query = query.in('id', cityIds);
  } else {
    // Filter based on action if no specific cities provided
    switch (action) {
      case 'fetch_images':
        query = query.is('image_url', null);
        break;
      case 'fetch_wikipedia':
        query = query.or('description.is.null,wikipedia_url.is.null');
        break;
      case 'fetch_all':
        query = query.or('image_url.is.null,description.is.null');
        break;
    }
  }
  
  const { data: cities, error } = await query.limit(50); // Process in batches
  
  if (error) {
    throw new Error(`Failed to fetch cities: ${error.message}`);
  }
  
  return cities || [];
}

async function processImagesFetch(cities: any[], batchSize = 10) {
  console.log(`Processing images for ${cities.length} cities...`);
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  // Process in smaller batches to avoid overwhelming APIs
  for (let i = 0; i < cities.length; i += batchSize) {
    const batch = cities.slice(i, i + batchSize);
    console.log(`Processing image batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cities.length / batchSize)}`);
    
    for (const city of batch) {
      try {
        const result = await callEdgeFunction('fetch-city-images', {
          cityId: city.id,
          cityName: city.name,
          countryName: city.countries?.name || ''
        });
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        
        results.push({
          cityId: city.id,
          cityName: city.name,
          action: 'fetch_images',
          ...result
        });
        
        // Add delay between requests to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error fetching image for city ${city.name}:`, error);
        errorCount++;
        results.push({
          cityId: city.id,
          cityName: city.name,
          action: 'fetch_images',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Pause between batches
    if (i + batchSize < cities.length) {
      console.log('Pausing between batches...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return { results, successCount, errorCount };
}

async function processWikipediaFetch(cities: any[], language = 'en', batchSize = 5) {
  console.log(`Processing Wikipedia data for ${cities.length} cities...`);
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  // Process in smaller batches for Wikipedia (more restrictive rate limits)
  for (let i = 0; i < cities.length; i += batchSize) {
    const batch = cities.slice(i, i + batchSize);
    console.log(`Processing Wikipedia batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cities.length / batchSize)}`);
    
    for (const city of batch) {
      try {
        const query = city.countries 
          ? `${city.name}, ${city.countries.name}`
          : city.name;
        
        const result = await callEdgeFunction('fetch-wikipedia-data', {
          query,
          type: 'city',
          entityId: city.id,
          language
        });
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        
        results.push({
          cityId: city.id,
          cityName: city.name,
          action: 'fetch_wikipedia',
          ...result
        });
        
        // Add delay between requests (Wikipedia has stricter rate limits)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`Error fetching Wikipedia data for city ${city.name}:`, error);
        errorCount++;
        results.push({
          cityId: city.id,
          cityName: city.name,
          action: 'fetch_wikipedia',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Pause between batches
    if (i + batchSize < cities.length) {
      console.log('Pausing between Wikipedia batches...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  return { results, successCount, errorCount };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: CityDataImportRequest = await req.json().catch(() => ({ action: 'fetch_all' }));
    const { action = 'fetch_all', cityIds, batchSize = 10, language = 'en' } = requestData;
    
    console.log('City data import request:', { action, cityIds, batchSize, language });
    
    const supabase = await initializeSupabaseClient();
    
    // Get cities to process
    const cities = await getCitiesForProcessing(supabase, cityIds, action);
    
    if (cities.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No cities found that need processing',
          processed: 0,
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
    console.log(`Found ${cities.length} cities to process for action: ${action}`);
    
    const results = [];
    let totalSuccessCount = 0;
    let totalErrorCount = 0;
    
    // Process based on action
    if (action === 'fetch_images' || action === 'fetch_all') {
      const imageResults = await processImagesFetch(cities, batchSize);
      results.push(...imageResults.results);
      totalSuccessCount += imageResults.successCount;
      totalErrorCount += imageResults.errorCount;
    }
    
    if (action === 'fetch_wikipedia' || action === 'fetch_all') {
      const wikipediaResults = await processWikipediaFetch(cities, language, Math.min(batchSize, 5));
      results.push(...wikipediaResults.results);
      totalSuccessCount += wikipediaResults.successCount;
      totalErrorCount += wikipediaResults.errorCount;
    }
    
    const summary = {
      success: true,
      message: `City data import completed: ${totalSuccessCount} successful operations, ${totalErrorCount} errors`,
      action,
      processed: cities.length,
      totalOperations: results.length,
      successCount: totalSuccessCount,
      errorCount: totalErrorCount,
      timestamp: new Date().toISOString()
    };
    
    console.log('City data import completed:', summary);
    
    return new Response(
      JSON.stringify({
        ...summary,
        details: results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in city data import:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Failed to import city data',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
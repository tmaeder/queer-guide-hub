import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageResult {
  url: string;
  thumbnail: string;
  alt: string;
  photographer: string;
  photographer_url: string;
  source: 'pexels' | 'unsplash';
  source_id: string;
  stored_url?: string;
}

interface CityImageRequest {
  cityId?: string;
  cityName?: string;
  countryName?: string;
  batchMode?: boolean;
}

async function initializeSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function validateApiKeys() {
  const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
  const unsplashApiKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  
  if (!pexelsApiKey && !unsplashApiKey) {
    throw new Error('No image API keys configured. Please set PEXELS_API_KEY or UNSPLASH_ACCESS_KEY');
  }
  
  return { pexelsApiKey, unsplashApiKey };
}

async function checkExistingImage(supabase: any, cityId: string) {
  const { data: existingCity, error } = await supabase
    .from('cities')
    .select('image_url, image_metadata')
    .eq('id', cityId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Database error: ${error.message}`);
  }

  return existingCity;
}

function generateSearchQueries(cityName: string, countryName: string): string[] {
  return [
    `${cityName} city skyline architecture`,
    `${cityName} ${countryName} landmarks`,
    `${cityName} downtown cityscape`,
    `${cityName} famous buildings`,
    `${cityName} aerial view`
  ];
}

async function fetchFromPexels(apiKey: string, searchQuery: string): Promise<ImageResult | null> {
  try {
    console.log('Searching Pexels for:', searchQuery);
    
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
      {
        headers: {
          'Authorization': apiKey,
        },
      }
    );

    if (!response.ok) {
      console.log('Pexels API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (data.photos && data.photos.length > 0) {
      const photo = data.photos[0];
      console.log('Found Pexels image:', photo.src.large);
      
      return {
        url: photo.src.large,
        thumbnail: photo.src.medium,
        alt: photo.alt || searchQuery,
        photographer: photo.photographer,
        photographer_url: photo.photographer_url,
        source: 'pexels',
        source_id: photo.id.toString()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Pexels fetch error:', error);
    return null;
  }
}

async function fetchFromUnsplash(apiKey: string, searchQuery: string): Promise<ImageResult | null> {
  try {
    console.log('Searching Unsplash for:', searchQuery);
    
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
      {
        headers: {
          'Authorization': `Client-ID ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.log('Unsplash API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const photo = data.results[0];
      console.log('Found Unsplash image:', photo.urls.regular);
      
      return {
        url: photo.urls.regular,
        thumbnail: photo.urls.small,
        alt: photo.alt_description || photo.description || searchQuery,
        photographer: photo.user.name,
        photographer_url: photo.user.links.html,
        source: 'unsplash',
        source_id: photo.id
      };
    }
    
    return null;
  } catch (error) {
    console.error('Unsplash fetch error:', error);
    return null;
  }
}

async function searchForImage(
  cityName: string, 
  countryName: string, 
  pexelsApiKey?: string, 
  unsplashApiKey?: string
): Promise<ImageResult | null> {
  const searchQueries = generateSearchQueries(cityName, countryName);
  
  for (const query of searchQueries) {
    console.log('Trying search query:', query);
    
    // Try Pexels first if available
    if (pexelsApiKey) {
      const pexelsResult = await fetchFromPexels(pexelsApiKey, query);
      if (pexelsResult) return pexelsResult;
    }
    
    // Try Unsplash if Pexels didn't work or isn't available
    if (unsplashApiKey) {
      const unsplashResult = await fetchFromUnsplash(unsplashApiKey, query);
      if (unsplashResult) return unsplashResult;
    }
  }
  
  return null;
}

async function storeImageInSupabase(supabase: any, imageResult: ImageResult, cityId: string): Promise<string> {
  try {
    console.log('Downloading and storing image from:', imageResult.url);
    
    const imageResponse = await fetch(imageResult.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const fileName = `${cityId}-${Date.now()}.jpg`;
    const filePath = `cities/${fileName}`;

    console.log('Uploading to Supabase Storage:', filePath);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('city-images')
      .upload(filePath, imageBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return imageResult.url; // Return original URL as fallback
    }

    console.log('Image uploaded successfully:', uploadData.path);
    
    const { data: publicUrlData } = supabase.storage
      .from('city-images')
      .getPublicUrl(uploadData.path);
    
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error storing image:', error);
    return imageResult.url; // Return original URL as fallback
  }
}

async function updateCityWithImage(supabase: any, cityId: string, imageResult: ImageResult, storedUrl: string) {
  const imageMetadata = {
    thumbnail: imageResult.thumbnail,
    alt: imageResult.alt,
    photographer: imageResult.photographer,
    photographer_url: imageResult.photographer_url,
    source: imageResult.source,
    source_id: imageResult.source_id,
    stored_locally: storedUrl !== imageResult.url,
    updated_at: new Date().toISOString()
  };

  console.log('Updating city record with image URL:', storedUrl);
  
  const { error: updateError } = await supabase
    .from('cities')
    .update({ 
      image_url: storedUrl,
      image_metadata: imageMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', cityId);

  if (updateError) {
    throw new Error(`Failed to update city record: ${updateError.message}`);
  }

  return imageMetadata;
}

async function processSingleCity(
  supabase: any, 
  cityId: string, 
  cityName: string, 
  countryName: string,
  pexelsApiKey?: string,
  unsplashApiKey?: string,
  forceUpdate = false
) {
  console.log('Processing city:', { cityId, cityName, countryName });

  // Check if city already has an image
  if (!forceUpdate) {
    const existingCity = await checkExistingImage(supabase, cityId);
    if (existingCity?.image_url) {
      console.log('City already has image:', existingCity.image_url);
      return {
        success: true,
        image_url: existingCity.image_url,
        image_metadata: existingCity.image_metadata,
        cached: true
      };
    }
  }

  // Search for image
  const imageResult = await searchForImage(cityName, countryName, pexelsApiKey, unsplashApiKey);
  
  if (!imageResult) {
    console.log('No images found for city:', cityName);
    return {
      success: false,
      error: 'No images found',
      message: `Could not find any images for ${cityName}`
    };
  }

  // Store image and update city
  const storedUrl = await storeImageInSupabase(supabase, imageResult, cityId);
  const imageMetadata = await updateCityWithImage(supabase, cityId, imageResult, storedUrl);

  console.log('Successfully processed city:', cityName);
  
  return {
    success: true,
    image_url: storedUrl,
    image_metadata: imageMetadata,
    cached: false
  };
}

async function processBatchMode(supabase: any, pexelsApiKey?: string, unsplashApiKey?: string) {
  console.log('Starting batch mode - processing all cities without images...');
  
  const { data: cities, error } = await supabase
    .from('cities')
    .select('id, name, countries(name)')
    .is('image_url', null)
    .limit(50); // Process in chunks

  if (error) {
    throw new Error(`Failed to fetch cities: ${error.message}`);
  }

  if (!cities || cities.length === 0) {
    return {
      success: true,
      message: 'No cities without images found',
      processed: 0
    };
  }

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const city of cities) {
    try {
      const result = await processSingleCity(
        supabase,
        city.id,
        city.name,
        city.countries?.name || '',
        pexelsApiKey,
        unsplashApiKey
      );
      
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      results.push({ cityId: city.id, cityName: city.name, ...result });
      
      // Add delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error processing city ${city.name}:`, error);
      errorCount++;
      results.push({
        cityId: city.id,
        cityName: city.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return {
    success: true,
    message: `Batch processing completed: ${successCount} successful, ${errorCount} errors`,
    processed: cities.length,
    successCount,
    errorCount,
    results
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: CityImageRequest = await req.json().catch(() => ({}));
    const { cityId, cityName, countryName, batchMode } = requestData;
    
    // Initialize clients and validate API keys
    const supabase = await initializeSupabaseClient();
    const { pexelsApiKey, unsplashApiKey } = await validateApiKeys();
    
    console.log('City image fetch request:', { cityId, cityName, countryName, batchMode });

    let result;

    if (batchMode) {
      result = await processBatchMode(supabase, pexelsApiKey, unsplashApiKey);
    } else {
      if (!cityId || !cityName) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'cityId and cityName are required for single city processing' 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      result = await processSingleCity(
        supabase,
        cityId,
        cityName,
        countryName || '',
        pexelsApiKey,
        unsplashApiKey
      );
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
    console.error('Error in fetch-city-images function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Failed to fetch city images',
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
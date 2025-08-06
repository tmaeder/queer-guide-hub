import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cityId, cityName, countryName } = await req.json();
    
    if (!cityId || !cityName) {
      return new Response(
        JSON.stringify({ error: 'cityId and cityName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Fetching image for city:', { cityId, cityName, countryName });

    // Check if city already has an image
    const { data: existingCity, error: fetchError } = await supabase
      .from('cities')
      .select('image_url')
      .eq('id', cityId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching city:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If city already has an image, return it
    if (existingCity?.image_url) {
      console.log('City already has image:', existingCity.image_url);
      return new Response(
        JSON.stringify({ 
          success: true, 
          image_url: existingCity.image_url,
          cached: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    const unsplashApiKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
    
    if (!pexelsApiKey && !unsplashApiKey) {
      console.error('No image API keys configured');
      return new Response(
        JSON.stringify({ error: 'No image API keys configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create search queries for better results
    const searchQueries = [
      `${cityName} city skyline architecture`,
      `${cityName} ${countryName} landmarks`,
      `${cityName} downtown cityscape`,
      `${cityName} famous buildings`
    ];

    let selectedImage = null;

    // Try each search query until we find a good image
    for (const searchQuery of searchQueries) {
      console.log('Trying search query:', searchQuery);

      // Try Pexels first
      if (pexelsApiKey && !selectedImage) {
        try {
          console.log('Fetching from Pexels...');
          const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`;
          
          const pexelsResponse = await fetch(pexelsUrl, {
            headers: {
              'Authorization': pexelsApiKey,
            },
          });

          if (pexelsResponse.ok) {
            const pexelsData = await pexelsResponse.json();
            if (pexelsData.photos && pexelsData.photos.length > 0) {
              const photo = pexelsData.photos[0]; // Take the first result
              selectedImage = {
                url: photo.src.large,
                thumbnail: photo.src.medium,
                alt: photo.alt || `${cityName} cityscape`,
                photographer: photo.photographer,
                photographer_url: photo.photographer_url,
                source: 'pexels',
                source_id: photo.id.toString()
              };
              console.log('Found Pexels image:', selectedImage.url);
              break;
            }
          } else {
            console.log('Pexels API error:', pexelsResponse.status, pexelsResponse.statusText);
          }
        } catch (error) {
          console.error('Pexels fetch error:', error);
        }
      }

      // Try Unsplash if Pexels didn't work
      if (unsplashApiKey && !selectedImage) {
        try {
          console.log('Fetching from Unsplash...');
          const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`;
          
          const unsplashResponse = await fetch(unsplashUrl, {
            headers: {
              'Authorization': `Client-ID ${unsplashApiKey}`,
            },
          });

          if (unsplashResponse.ok) {
            const unsplashData = await unsplashResponse.json();
            if (unsplashData.results && unsplashData.results.length > 0) {
              const photo = unsplashData.results[0]; // Take the first result
              selectedImage = {
                url: photo.urls.regular,
                thumbnail: photo.urls.small,
                alt: photo.alt_description || photo.description || `${cityName} cityscape`,
                photographer: photo.user.name,
                photographer_url: photo.user.links.html,
                source: 'unsplash',
                source_id: photo.id
              };
              console.log('Found Unsplash image:', selectedImage.url);
              break;
            }
          } else {
            console.log('Unsplash API error:', unsplashResponse.status, unsplashResponse.statusText);
          }
        } catch (error) {
          console.error('Unsplash fetch error:', error);
        }
      }
    }

    if (!selectedImage) {
      console.log('No images found for city:', cityName);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No images found',
          message: 'Could not find any images for this city'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download and store the image in Supabase Storage
    try {
      console.log('Downloading image from:', selectedImage.url);
      const imageResponse = await fetch(selectedImage.url);
      
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
        // Don't fail completely, just return the external URL
      } else {
        console.log('Image uploaded successfully:', uploadData.path);
        
        // Get the public URL
        const { data: publicUrlData } = supabase.storage
          .from('city-images')
          .getPublicUrl(uploadData.path);
        
        selectedImage.stored_url = publicUrlData.publicUrl;
      }
    } catch (error) {
      console.error('Error storing image:', error);
      // Continue with external URL
    }

    // Update the city record with the image URL and metadata
    const imageUrl = selectedImage.stored_url || selectedImage.url;
    const imageMetadata = {
      thumbnail: selectedImage.thumbnail,
      alt: selectedImage.alt,
      photographer: selectedImage.photographer,
      photographer_url: selectedImage.photographer_url,
      source: selectedImage.source,
      source_id: selectedImage.source_id,
      stored_locally: !!selectedImage.stored_url
    };

    console.log('Updating city record with image URL:', imageUrl);
    const { error: updateError } = await supabase
      .from('cities')
      .update({ 
        image_url: imageUrl,
        image_metadata: imageMetadata
      })
      .eq('id', cityId);

    if (updateError) {
      console.error('Error updating city:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update city record', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully updated city with image');
    return new Response(
      JSON.stringify({
        success: true,
        image_url: imageUrl,
        image_metadata: imageMetadata,
        cached: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-and-store-city-images function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch and store city images',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
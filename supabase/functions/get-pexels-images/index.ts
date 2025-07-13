import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type } = await req.json();
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('PEXELS_API_KEY');
    if (!apiKey) {
      console.error('PEXELS_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'Pexels API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Pexels images for:', { query, type });

    // Create search query based on type
    let searchQuery = query;
    if (type === 'country') {
      searchQuery = `${query} landscape architecture landmarks`;
    } else if (type === 'city') {
      searchQuery = `${query} city skyline architecture`;
    }

    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=6&orientation=landscape`;
    
    const response = await fetch(pexelsUrl, {
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      console.error('Pexels API error:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch images from Pexels' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    const images = data.photos?.map((photo: any) => ({
      id: photo.id,
      url: photo.src.large,
      thumbnail: photo.src.medium,
      alt: photo.alt,
      photographer: photo.photographer,
      photographer_url: photo.photographer_url
    })) || [];

    console.log('Pexels images fetched successfully:', images.length, 'images');

    return new Response(
      JSON.stringify({
        success: true,
        images,
        total: data.total_results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-pexels-images function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
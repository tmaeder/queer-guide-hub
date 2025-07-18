import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tagId, tagName } = await req.json();
    
    if (!tagId || !tagName) {
      return new Response(
        JSON.stringify({ error: 'Tag ID and name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Processing tag:', { tagId, tagName });

    // Force reimport - skip existing image check

    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    const unsplashApiKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
    
    if (!pexelsApiKey && !unsplashApiKey) {
      throw new Error('No image API keys configured');
    }

    // Build search query focused on the tag content
    const additionalKeywords = getTagSpecificKeywords(tagName);
    const searchQuery = `${tagName} ${additionalKeywords}`.trim();

    let imageUrl = null;
    let imageBlob = null;

    // Try Pexels first
    if (pexelsApiKey && !imageBlob) {
      try {
        console.log('Fetching from Pexels...');
        const pexelsResponse = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=1&orientation=landscape`,
          {
            headers: {
              'Authorization': pexelsApiKey,
            },
          }
        );

        if (pexelsResponse.ok) {
          const pexelsData = await pexelsResponse.json();
          if (pexelsData.photos?.length > 0) {
            imageUrl = pexelsData.photos[0].src.medium;
          }
        }
      } catch (error) {
        console.error('Pexels fetch error:', error);
      }
    }

    // Try Unsplash if Pexels didn't work
    if (unsplashApiKey && !imageUrl) {
      try {
        console.log('Fetching from Unsplash...');
        const unsplashResponse = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=1&orientation=landscape`,
          {
            headers: {
              'Authorization': `Client-ID ${unsplashApiKey}`,
            },
          }
        );

        if (unsplashResponse.ok) {
          const unsplashData = await unsplashResponse.json();
          if (unsplashData.results?.length > 0) {
            imageUrl = unsplashData.results[0].urls.regular;
          }
        }
      } catch (error) {
        console.error('Unsplash fetch error:', error);
      }
    }

    if (!imageUrl) {
      throw new Error('No images found for tag');
    }

    // Download the image
    console.log('Downloading image from:', imageUrl);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download image');
    }

    imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Generate filename
    const sanitizedTagName = tagName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const fileExtension = imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') ? 'jpg' : 'png';
    const fileName = `${sanitizedTagName}-${Date.now()}.${fileExtension}`;

    // Upload to Supabase storage
    console.log('Uploading to storage:', fileName);
    const { error: uploadError } = await supabase.storage
      .from('tag-images')
      .upload(fileName, imageBuffer, {
        contentType: imageBlob.type || 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('tag-images')
      .getPublicUrl(fileName);

    const storedImageUrl = publicUrlData.publicUrl;

    // Update tag with image URL
    const { error: updateError } = await supabase
      .from('unified_tags')
      .update({ image_url: storedImageUrl })
      .eq('id', tagId);

    if (updateError) {
      throw new Error(`Failed to update tag: ${updateError.message}`);
    }

    console.log('Successfully stored image for tag:', tagName);

    return new Response(
      JSON.stringify({
        success: true,
        image_url: storedImageUrl,
        message: `Image stored for tag: ${tagName}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in store-tag-images function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

// Helper function to get tag-specific keywords for better image search
function getTagSpecificKeywords(tagName: string): string {
  const tag = tagName.toLowerCase();
  
  // Only add specific keywords for identity/orientation tags
  if (tag.includes('pride') || tag.includes('flag')) {
    return 'flag celebration';
  } else if (tag.includes('transgender') || tag.includes('trans')) {
    return 'transgender';
  } else if (tag.includes('lesbian')) {
    return 'lesbian women';
  } else if (tag.includes('gay')) {
    return 'gay';
  } else if (tag.includes('bisexual') || tag.includes('bi')) {
    return 'bisexual';
  } else if (tag.includes('pansexual') || tag.includes('pan')) {
    return 'pansexual';
  } else if (tag.includes('non-binary') || tag.includes('nonbinary')) {
    return 'non-binary';
  } else if (tag.includes('event') || tag.includes('party')) {
    return 'event party';
  } else if (tag.includes('venue') || tag.includes('space')) {
    return 'venue space';
  } else if (tag.includes('health') || tag.includes('mental')) {
    return 'health wellness';
  } else if (tag.includes('community') || tag.includes('group')) {
    return 'community group';
  } else if (tag.includes('travel')) {
    return 'travel destination';
  } else if (tag.includes('food') || tag.includes('restaurant')) {
    return 'food restaurant';
  } else if (tag.includes('music') || tag.includes('art')) {
    return 'music art creative';
  } else if (tag.includes('sport') || tag.includes('fitness')) {
    return 'sport fitness exercise';
  } else if (tag.includes('book') || tag.includes('reading')) {
    return 'book reading literature';
  } else if (tag.includes('tech') || tag.includes('gaming')) {
    return 'technology gaming';
  } else {
    // For other tags, don't add extra keywords - let the tag speak for itself
    return '';
  }
}
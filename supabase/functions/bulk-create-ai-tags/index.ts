import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { terms } = await req.json();
    
    if (!terms || !Array.isArray(terms)) {
      return new Response(
        JSON.stringify({ error: 'Terms array is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const results = [];
    const categories = [
      'identity', 'relationships', 'health', 'culture', 'politics', 'entertainment',
      'business', 'technology', 'education', 'travel', 'food', 'sports',
      'arts', 'community', 'activism', 'legal', 'history', 'literature'
    ];

    for (const term of terms) {
      if (!term.trim()) continue;

      const cleanTerm = term.trim();
      const slug = cleanTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      try {
        // Check if tag already exists
        const { data: existingTag } = await supabaseClient
          .from('unified_tags')
          .select('id, name')
          .eq('slug', slug)
          .single();

        if (existingTag) {
          results.push({
            term: cleanTerm,
            status: 'exists',
            tag: existingTag
          });
          continue;
        }

        // Get Wikipedia data
        const wikiData = await getWikipediaData(cleanTerm);
        
        // Use AI to categorize and enhance description
        const aiResponse = await categorizeWithAI(cleanTerm, wikiData.description, categories, openAIApiKey);
        
        // Fetch and upload image
        const imageUrl = await fetchAndStoreImage(cleanTerm, supabaseClient);
        
        // Create the tag
        const { data: newTag, error: tagError } = await supabaseClient
          .from('unified_tags')
          .insert({
            name: cleanTerm,
            slug: slug,
            category: aiResponse.category,
            description: aiResponse.description,
            image_url: imageUrl,
            usage_count: 0
          })
          .select()
          .single();

        if (tagError) {
          console.error('Error creating tag:', tagError);
          results.push({
            term: cleanTerm,
            status: 'error',
            error: tagError.message
          });
        } else {
          results.push({
            term: cleanTerm,
            status: 'created',
            tag: newTag,
            category: aiResponse.category,
            description: aiResponse.description,
            image_url: imageUrl
          });
        }

      } catch (error) {
        console.error(`Error processing term "${cleanTerm}":`, error);
        results.push({
          term: cleanTerm,
          status: 'error',
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        summary: {
          total: terms.length,
          created: results.filter(r => r.status === 'created').length,
          exists: results.filter(r => r.status === 'exists').length,
          errors: results.filter(r => r.status === 'error').length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in bulk-create-ai-tags:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function getWikipediaData(term: string) {
  try {
    // Search Wikipedia for the term
    const searchResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`
    );
    
    if (searchResponse.ok) {
      const data = await searchResponse.json();
      return {
        description: data.extract || '',
        url: data.content_urls?.desktop?.page || '',
        title: data.title || term
      };
    }
  } catch (error) {
    console.log(`Could not fetch Wikipedia data for "${term}":`, error.message);
  }
  
  return {
    description: '',
    url: '',
    title: term
  };
}

async function categorizeWithAI(term: string, wikiDescription: string, categories: string[], apiKey: string) {
  try {
    const prompt = `Analyze the term "${term}" and its description: "${wikiDescription}"

Choose the most appropriate category from this list: ${categories.join(', ')}

Also provide a concise, informative description (2-3 sentences) that would be helpful for someone browsing tags in an LGBTQ+ community platform.

Respond with JSON in this format:
{
  "category": "selected_category",
  "description": "enhanced description"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at categorizing and describing terms for an LGBTQ+ community platform. Provide accurate, inclusive, and helpful categorizations and descriptions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(content);
      
      // Validate category
      if (!categories.includes(parsed.category)) {
        parsed.category = 'general';
      }
      
      // Use original description if AI didn't provide one
      if (!parsed.description && wikiDescription) {
        parsed.description = wikiDescription.substring(0, 300) + (wikiDescription.length > 300 ? '...' : '');
      }
      
      return parsed;
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return {
        category: 'general',
        description: wikiDescription || `Information about ${term}`
      };
    }

  } catch (error) {
    console.error('Error with AI categorization:', error);
    return {
      category: 'general',
      description: wikiDescription || `Information about ${term}`
    };
  }
}

async function fetchAndStoreImage(term: string, supabaseClient: any): Promise<string | null> {
  try {
    console.log(`Fetching image for term: ${term}`);
    
    // Try Wikimedia Commons first
    let imageUrl = await getWikimediaImage(term);
    
    // If no Wikimedia image, try Unsplash
    if (!imageUrl) {
      imageUrl = await getUnsplashImage(term);
    }
    
    if (!imageUrl) {
      console.log(`No image found for term: ${term}`);
      return null;
    }
    
    // Download and upload to Supabase storage
    const storedImageUrl = await downloadAndStoreImage(imageUrl, term, supabaseClient);
    return storedImageUrl;
    
  } catch (error) {
    console.error(`Error fetching image for "${term}":`, error);
    return null;
  }
}

async function getWikimediaImage(term: string): Promise<string | null> {
  try {
    // Search for images on Wikimedia Commons
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=6&format=json&origin=*&srlimit=5`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.query?.search?.length > 0) {
      // Get the first image file
      const fileName = searchData.query.search[0].title;
      
      // Get image info
      const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
      
      const imageResponse = await fetch(imageInfoUrl);
      const imageData = await imageResponse.json();
      
      const pages = imageData.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        const imageInfo = pages[pageId]?.imageinfo?.[0];
        
        if (imageInfo?.thumburl) {
          console.log(`Found Wikimedia image for "${term}": ${imageInfo.thumburl}`);
          return imageInfo.thumburl;
        }
      }
    }
  } catch (error) {
    console.log(`Wikimedia search failed for "${term}":`, error.message);
  }
  
  return null;
}

async function getUnsplashImage(term: string): Promise<string | null> {
  try {
    const unsplashAccessKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
    if (!unsplashAccessKey) {
      console.log('Unsplash access key not configured');
      return null;
    }
    
    const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(term)}&per_page=1&orientation=landscape`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Client-ID ${unsplashAccessKey}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.results?.length > 0) {
        const imageUrl = data.results[0].urls.regular;
        console.log(`Found Unsplash image for "${term}": ${imageUrl}`);
        return imageUrl;
      }
    }
  } catch (error) {
    console.log(`Unsplash search failed for "${term}":`, error.message);
  }
  
  return null;
}

async function downloadAndStoreImage(imageUrl: string, term: string, supabaseClient: any): Promise<string | null> {
  try {
    console.log(`Downloading image from: ${imageUrl}`);
    
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    
    const imageBlob = await response.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    
    // Generate filename
    const fileExtension = imageUrl.includes('.jpg') || imageUrl.includes('jpeg') ? 'jpg' : 'png';
    const fileName = `${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.${fileExtension}`;
    
    // Upload to Supabase storage
    const { data, error } = await supabaseClient.storage
      .from('tag-images')
      .upload(fileName, arrayBuffer, {
        contentType: imageBlob.type || 'image/jpeg',
        cacheControl: '3600'
      });
    
    if (error) {
      console.error('Error uploading to storage:', error);
      return null;
    }
    
    // Get public URL
    const { data: publicUrlData } = supabaseClient.storage
      .from('tag-images')
      .getPublicUrl(fileName);
    
    console.log(`Image stored successfully: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
    
  } catch (error) {
    console.error('Error downloading and storing image:', error);
    return null;
  }
}
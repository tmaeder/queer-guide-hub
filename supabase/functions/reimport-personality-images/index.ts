import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

interface _Personality {
  id: string;
  name: string;
  image_url: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const { batchSize = 5, offset = 0 } = await req.json();
    const safeBatchSize = Math.min(batchSize || 5, 20);

    console.log(`Starting Wikipedia image reimport - batch size: ${safeBatchSize}, offset: ${offset}`);

    // Fetch personalities in batches
    const { data: personalities, error: fetchError } = await supabase
      .from('personalities')
      .select('id, name, image_url')
      .range(offset, offset + safeBatchSize - 1);

    if (fetchError) {
      console.error('Error fetching personalities:', fetchError);
      throw fetchError;
    }

    if (!personalities || personalities.length === 0) {
      console.log('No more personalities to process');
      return new Response(JSON.stringify({
        success: true,
        message: 'No more personalities to process',
        processed: 0,
        hasMore: false
      }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${personalities.length} personalities...`);

    let processedCount = 0;
    let updatedCount = 0;

    for (const personality of personalities) {
      try {
        console.log(`Processing: ${personality.name}`);

        // Search for Wikipedia image
        const imageUrl = await getWikipediaImage(personality.name);

        if (imageUrl && imageUrl !== personality.image_url) {
          console.log(`Found new image for ${personality.name}: ${imageUrl}`);

          // Update personality with new image
          const { error: updateError } = await supabase
            .from('personalities')
            .update({
              image_url: imageUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', personality.id);

          if (updateError) {
            console.error(`Error updating ${personality.name}:`, updateError);
          } else {
            console.log(`Successfully updated image for: ${personality.name}`);
            updatedCount++;
          }
        } else if (!imageUrl) {
          console.log(`No Wikipedia image found for: ${personality.name}`);
        } else {
          console.log(`Image already up to date for: ${personality.name}`);
        }

        processedCount++;

        // Small delay to avoid overwhelming Wikipedia API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing ${personality.name}:`, error);
        processedCount++;
      }
    }

    // Check if there are more personalities to process
    const { count } = await supabase
      .from('personalities')
      .select('*', { count: 'exact', head: true });

    const hasMore = count ? (offset + safeBatchSize) < count : false;

    console.log(`Batch completed. Processed: ${processedCount}, Updated: ${updatedCount}, Has more: ${hasMore}`);

    return new Response(JSON.stringify({
      success: true,
      processed: processedCount,
      updated: updatedCount,
      hasMore,
      nextOffset: offset + safeBatchSize,
      totalCount: count
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in reimport-personality-images function:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      success: false
    }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

async function getWikipediaImage(name: string): Promise<string | null> {
  try {
    // First, search for the page
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'QueerGuide/1.0 (https://queer.guide)'
      }
    });

    if (!searchResponse.ok) {
      console.log(`Wikipedia page not found for: ${name}`);
      return null;
    }

    const searchData = await searchResponse.json();

    if (searchData.thumbnail && searchData.thumbnail.source) {
      // Get high-resolution version of the image
      let imageUrl = searchData.thumbnail.source;

      // Convert to higher resolution if possible
      if (imageUrl.includes('/thumb/')) {
        // Remove size constraints to get full resolution
        imageUrl = imageUrl.replace(/\/\d+px-[^/]+$/, '');
        imageUrl = imageUrl.replace('/thumb/', '/');

        // Try to get the original file
        const parts = imageUrl.split('/');
        const filename = parts[parts.length - 1];
        imageUrl = imageUrl.replace(filename, decodeURIComponent(filename));
      }

      console.log(`Found Wikipedia image for ${name}: ${imageUrl}`);
      return imageUrl;
    }

    // Fallback: try to get page images using the API
    const pageTitle = searchData.title;
    if (pageTitle) {
      const imagesUrl = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(pageTitle)}`;
      const imagesResponse = await fetch(imagesUrl, {
        headers: {
          'User-Agent': 'QueerGuide/1.0 (https://queer.guide)'
        }
      });

      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        const mainImage = imagesData.items?.find((item: unknown) =>
          item.type === 'image' &&
          item.srcset &&
          !item.title.toLowerCase().includes('commons-logo') &&
          !item.title.toLowerCase().includes('edit-icon')
        );

        if (mainImage && mainImage.srcset) {
          // Get the highest resolution image from srcset
          const srcsetEntries = mainImage.srcset.split(',').map((entry: string) => {
            const [url, descriptor] = entry.trim().split(' ');
            const width = descriptor ? parseInt(descriptor.replace('w', '')) : 1;
            return { url, width };
          });

          const highestRes = srcsetEntries.reduce((prev: unknown, current: unknown) =>
            current.width > prev.width ? current : prev
          );

          console.log(`Found fallback Wikipedia image for ${name}: ${highestRes.url}`);
          return highestRes.url;
        }
      }
    }

    console.log(`No suitable Wikipedia image found for: ${name}`);
    return null;

  } catch (error) {
    console.error(`Error fetching Wikipedia image for ${name}:`, error);
    return null;
  }
}

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    console.log('Starting musician concerts update job');

    // Get all personalities that are musicians (living ones only to avoid unnecessary API calls)
    const { data: musicians, error: fetchError } = await supabase
      .from('personalities')
      .select('id, name, profession, is_living')
      .eq('is_living', true)
      .or('profession.ilike.%musician%,profession.ilike.%singer%,profession.ilike.%composer%,profession.ilike.%rapper%,profession.ilike.%band%,profession.ilike.%artist%');

    if (fetchError) {
      throw new Error(`Failed to fetch musicians: ${fetchError.message}`);
    }

    if (!musicians || musicians.length === 0) {
      console.log('No musicians found to update');
      return new Response(JSON.stringify({
        success: true,
        message: 'No musicians found to update',
        updated: 0
      }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${musicians.length} musicians to update`);

    const results = [];
    const errors = [];
    let updated = 0;

    // Process musicians in batches to avoid overwhelming the Bandsintown API
    const batchSize = 5;
    for (let i = 0; i < musicians.length; i += batchSize) {
      const batch = musicians.slice(i, i + batchSize);

      // Process each musician in the current batch
      const batchPromises = batch.map(async (musician) => {
        try {
          console.log(`Updating concerts for: ${musician.name}`);

          const concerts = await fetchUpcomingConcerts(musician.name);

          // Update the personality record with new concert data
          const { error: updateError } = await supabase
            .from('personalities')
            .update({
              next_concerts: concerts || [],
              updated_at: new Date().toISOString()
            })
            .eq('id', musician.id);

          if (updateError) {
            throw new Error(`Failed to update ${musician.name}: ${updateError.message}`);
          }

          console.log(`Successfully updated concerts for: ${musician.name} (${concerts?.length || 0} concerts)`);
          results.push({
            id: musician.id,
            name: musician.name,
            concerts_found: concerts?.length || 0
          });
          updated++;

        } catch (error) {
          console.error(`Error updating ${musician.name}:`, error);
          errors.push({
            id: musician.id,
            name: musician.name,
            error: 'Processing failed'
          });
        }
      });

      // Wait for current batch to complete
      await Promise.all(batchPromises);

      // Add a small delay between batches to be respectful to the API
      if (i + batchSize < musicians.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Concert update job completed: ${updated} updated, ${errors.length} errors`);

    return new Response(JSON.stringify({
      success: true,
      updated,
      errors: errors.length,
      results,
      errorDetails: errors
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-musician-concerts function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

async function fetchUpcomingConcerts(artistName: string): Promise<any[] | null> {
  try {
    // Clean artist name for search (remove common suffixes that might interfere)
    const cleanedName = artistName
      .replace(/\s*\(.*?\).*$/, '') // Remove parenthetical content
      .trim();

    console.log(`Searching for concerts for: ${cleanedName}`);

    // Search for the artist on Bandsintown
    const artistSearchUrl = `https://rest.bandsintown.com/artists/${encodeURIComponent(cleanedName)}?app_id=queer-guide`;
    const artistResponse = await fetch(artistSearchUrl);

    if (!artistResponse.ok) {
      console.log(`No artist found on Bandsintown for: ${cleanedName}`);
      return null;
    }

    const artistData = await artistResponse.json();

    if (!artistData || artistData.error) {
      console.log(`Artist not found on Bandsintown: ${cleanedName}`);
      return null;
    }

    // Get upcoming events for the artist
    const eventsUrl = `https://rest.bandsintown.com/artists/${encodeURIComponent(cleanedName)}/events?app_id=queer-guide&date=upcoming`;
    const eventsResponse = await fetch(eventsUrl);

    if (!eventsResponse.ok) {
      console.log(`No events found for artist: ${cleanedName}`);
      return null;
    }

    const eventsData = await eventsResponse.json();

    if (!Array.isArray(eventsData) || eventsData.length === 0) {
      console.log(`No upcoming events for ${cleanedName}`);
      return null;
    }

    // Format the concert data - take first 10 upcoming events for regular updates
    const concerts = eventsData.slice(0, 10).map(event => ({
      id: event.id,
      datetime: event.datetime,
      venue: {
        name: event.venue?.name || 'TBA',
        city: event.venue?.city || 'TBA',
        country: event.venue?.country || 'TBA',
        region: event.venue?.region || '',
      },
      lineup: event.lineup || [cleanedName],
      offers: event.offers || [],
      url: event.url || event.facebook_rsvp_url || '',
      description: event.description || '',
      on_sale_datetime: event.on_sale_datetime || null
    }));

    console.log(`Found ${concerts.length} upcoming concerts for ${cleanedName}`);
    return concerts;

  } catch (error) {
    console.error(`Error fetching concerts for ${artistName}:`, error);
    return null;
  }
}

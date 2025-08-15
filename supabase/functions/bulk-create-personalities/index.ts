import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

interface PersonalityData {
  name: string;
  description: string;
  birth_date: string | null;
  death_date: string | null;
  is_living: boolean;
  profession: string; // Changed from occupation to profession
  nationality: string;
  birth_place: string | null;
  image_url: string | null;
  bio: string;
  top_book?: string | null;
  next_concerts?: any[] | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { names, sources = {} } = await req.json();
    
    if (!names || !Array.isArray(names)) {
      throw new Error('Names array is required');
    }

    // Default sources configuration
    const sourceConfig = {
      wikidata: sources.wikidata !== false,
      wikipedia: sources.wikipedia !== false,
      openLibrary: sources.openLibrary !== false,
      bandsintown: sources.bandsintown !== false,
      pexelsImages: sources.pexelsImages !== false
    };

    console.log(`Processing ${names.length} personality names`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const results = [];
    const errors = [];

    for (const name of names) {
      try {
        console.log(`Processing: ${name}`);
        
        // Fetch personality data using the same logic as fetch-personality-data
        const personalityData = await fetchPersonalityData(name.trim(), sourceConfig);
        
        if (personalityData) {
          // Check if personality already exists
          const { data: existing } = await supabase
            .from('personalities')
            .select('id')
            .ilike('name', personalityData.name)
            .maybeSingle();

          if (!existing) {
            // Create personality entry
            const { data: personality, error: insertError } = await supabase
              .from('personalities')
              .insert({
                name: personalityData.name,
                description: personalityData.description,
                birth_date: personalityData.birth_date,
                death_date: personalityData.death_date,
                is_living: personalityData.is_living,
                profession: personalityData.profession,
                nationality: personalityData.nationality,
                birth_place: personalityData.birth_place,
                image_url: personalityData.image_url,
                bio: personalityData.bio,
                top_book: personalityData.top_book,
                next_concerts: personalityData.next_concerts || [],
                is_featured: false,
                visibility: 'public'
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Error inserting personality ${name}:`, insertError);
              errors.push({ name, error: insertError.message });
            } else {
              // Try to fetch additional images if no image was found from Wikidata and Pexels is enabled
              if (!personalityData.image_url && sourceConfig.pexelsImages) {
                try {
                  const imageResponse = await supabase.functions.invoke('get-pexels-images', {
                    body: { 
                      query: `${personalityData.name} portrait`,
                      type: 'person'
                    }
                  });
                  
                  if (imageResponse.data?.images?.[0]?.url) {
                    // Update personality with fetched image
                    await supabase
                      .from('personalities')
                      .update({ image_url: imageResponse.data.images[0].url })
                      .eq('id', personality.id);
                    
                    personality.image_url = imageResponse.data.images[0].url;
                  }
                } catch (imageError) {
                  console.log(`Could not fetch image for ${name}:`, imageError);
                }
              }
              
              console.log(`Successfully created personality: ${personalityData.name}`);
              results.push(personality);
            }
          } else {
            console.log(`Personality already exists: ${name}`);
            errors.push({ name, error: 'Personality already exists' });
          }
        } else {
          console.log(`No data found for: ${name}`);
          errors.push({ name, error: 'No data found' });
        }
      } catch (error) {
        console.error(`Error processing ${name}:`, error);
        errors.push({ name, error: error.message });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      created: results.length,
      errors: errors.length,
      results,
      errorDetails: errors 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in bulk-create-personalities function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchPersonalityData(searchTerm: string, sources: any): Promise<PersonalityData | null> {
  try {
    if (!sources.wikidata) {
      console.log(`Wikidata source disabled for: ${searchTerm}`);
      return null;
    }

    // Search for the entity in Wikidata
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&format=json&limit=1`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.search || searchData.search.length === 0) {
      console.log(`No Wikidata results found for: ${searchTerm}`);
      return null;
    }

    const entity = searchData.search[0] as WikidataSearchResult;
    const entityId = entity.id;

    // Get detailed information from Wikidata
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&format=json&languages=en`;
    const entityResponse = await fetch(entityUrl);
    const entityData = await entityResponse.json();

    const entityInfo = entityData.entities[entityId];
    if (!entityInfo) {
      return null;
    }

    // Extract data from Wikidata
    const name = entityInfo.labels?.en?.value || searchTerm;
    const description = entityInfo.descriptions?.en?.value || '';
    
    // Parse claims for additional information
    const claims = entityInfo.claims || {};
    
    // Birth date (P569)
    const birthDate = claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;
    
    // Death date (P570)
    const deathDate = claims.P570?.[0]?.mainsnak?.datavalue?.value?.time;
    
    // Occupation (P106)
    const occupationClaim = claims.P106?.[0];
    let occupation = '';
    if (occupationClaim) {
      const occupationId = occupationClaim.mainsnak?.datavalue?.value?.id;
      if (occupationId) {
        try {
          const occupationResponse = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${occupationId}&format=json&languages=en`);
          const occupationData = await occupationResponse.json();
          occupation = occupationData.entities[occupationId]?.labels?.en?.value || '';
        } catch (error) {
          console.error('Error fetching occupation:', error);
        }
      }
    }
    
    // Nationality (P27)
    const nationalityClaim = claims.P27?.[0];
    let nationality = '';
    if (nationalityClaim) {
      const nationalityId = nationalityClaim.mainsnak?.datavalue?.value?.id;
      if (nationalityId) {
        try {
          const nationalityResponse = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${nationalityId}&format=json&languages=en`);
          const nationalityData = await nationalityResponse.json();
          nationality = nationalityData.entities[nationalityId]?.labels?.en?.value || '';
        } catch (error) {
          console.error('Error fetching nationality:', error);
        }
      }
    }
    
    // Birth place (P19)
    const birthPlaceClaim = claims.P19?.[0];
    let birthPlace = null;
    if (birthPlaceClaim) {
      const birthPlaceId = birthPlaceClaim.mainsnak?.datavalue?.value?.id;
      if (birthPlaceId) {
        try {
          const birthPlaceResponse = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${birthPlaceId}&format=json&languages=en`);
          const birthPlaceData = await birthPlaceResponse.json();
          birthPlace = birthPlaceData.entities[birthPlaceId]?.labels?.en?.value || null;
        } catch (error) {
          console.error('Error fetching birth place:', error);
        }
      }
    }

    // Get Wikipedia page and bio
    let bio = description;
    const wikipediaTitle = entityInfo.sitelinks?.enwiki?.title;
    if (wikipediaTitle && sources.wikipedia) {
      try {
        const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikipediaTitle)}`);
        const wikiData = await wikiResponse.json();
        if (wikiData.extract) {
          bio = wikiData.extract;
        }
      } catch (error) {
        console.error('Error fetching Wikipedia bio:', error);
      }
    }

    // Get image from Wikidata (P18)
    let imageUrl = null;
    const imageClaim = claims.P18?.[0];
    if (imageClaim) {
      const imageFile = imageClaim.mainsnak?.datavalue?.value;
      if (imageFile) {
        // Convert to Wikimedia Commons URL
        const fileName = imageFile.replace(/ /g, '_');
        imageUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${fileName}`;
      }
    }

    const formatDate = (dateString: string | null): string | null => {
      if (!dateString) return null;
      try {
        // Wikidata dates are in format +YYYY-MM-DDTHH:mm:ssZ
        const match = dateString.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const year = match[1];
          const month = match[2] === '00' ? '01' : match[2];
          const day = match[3] === '00' ? '01' : match[3];
          return `${year}-${month}-${day}`;
        }
      } catch (error) {
        console.error('Error formatting date:', error);
      }
      return null;
    };

    // Fetch top book if the person is an author and Open Library is enabled
    let topBook = null;
    if (sources.openLibrary && occupation && (occupation.toLowerCase().includes('author') || occupation.toLowerCase().includes('writer') || occupation.toLowerCase().includes('novelist') || occupation.toLowerCase().includes('poet'))) {
      topBook = await fetchTopBook(name);
    }

    // Fetch upcoming concerts if the person is a musician and Bandsintown is enabled
    let nextConcerts = null;
    if (sources.bandsintown && occupation && (occupation.toLowerCase().includes('musician') || occupation.toLowerCase().includes('singer') || occupation.toLowerCase().includes('composer') || occupation.toLowerCase().includes('rapper') || occupation.toLowerCase().includes('band') || occupation.toLowerCase().includes('artist'))) {
      nextConcerts = await fetchUpcomingConcerts(name);
    }

    return {
      name,
      description,
      birth_date: formatDate(birthDate),
      death_date: formatDate(deathDate),
      is_living: !deathDate, // True if no death date
      profession: occupation, // Map occupation data to profession field
      nationality,
      birth_place: birthPlace,
      image_url: imageUrl,
      bio,
      top_book: topBook,
      next_concerts: nextConcerts
    };

  } catch (error) {
    console.error('Error fetching personality data:', error);
    return null;
  }
}

async function fetchTopBook(authorName: string): Promise<string | null> {
  try {
    // Search for the author in Open Library
    const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.docs || searchData.docs.length === 0) {
      console.log(`No Open Library author found for: ${authorName}`);
      return null;
    }

    const author = searchData.docs[0];
    const authorKey = author.key;

    if (!authorKey) {
      return null;
    }

    // Get author's works
    const worksUrl = `https://openlibrary.org/authors/${authorKey}/works.json?limit=50`;
    const worksResponse = await fetch(worksUrl);
    const worksData = await worksResponse.json();

    if (!worksData.entries || worksData.entries.length === 0) {
      console.log(`No works found for author: ${authorName}`);
      return null;
    }

    // Find the most popular work (highest edition count or first in list)
    let topWork = null;
    let maxEditions = 0;

    for (const work of worksData.entries.slice(0, 20)) { // Check first 20 works
      const workKey = work.key;
      
      try {
        // Get work details to find edition count
        const workUrl = `https://openlibrary.org${workKey}.json`;
        const workResponse = await fetch(workUrl);
        const workData = await workResponse.json();
        
        // Count editions by checking covers or simply use the work if it has a title
        if (workData.title) {
          const editionCount = workData.covers ? workData.covers.length : 1;
          
          if (editionCount > maxEditions || !topWork) {
            maxEditions = editionCount;
            topWork = workData.title;
          }
        }
      } catch (error) {
        console.log(`Error fetching work details for ${workKey}:`, error);
        // If we can't get details, just use the first work with a title
        if (work.title && !topWork) {
          topWork = work.title;
        }
      }
    }

    if (topWork) {
      console.log(`Found top book for ${authorName}: ${topWork}`);
      return topWork;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching top book for ${authorName}:`, error);
    return null;
  }
}

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

    // Format the concert data - take first 5 upcoming events
    const concerts = eventsData.slice(0, 5).map(event => ({
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
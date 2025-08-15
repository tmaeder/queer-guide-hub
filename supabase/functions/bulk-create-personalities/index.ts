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
  profession: string; // Changed from occupation to profession
  nationality: string;
  birth_place: string | null;
  image_url: string | null;
  bio: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { names } = await req.json();
    
    if (!names || !Array.isArray(names)) {
      throw new Error('Names array is required');
    }

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
        const personalityData = await fetchPersonalityData(name.trim());
        
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
                profession: personalityData.profession,
                nationality: personalityData.nationality,
                birth_place: personalityData.birth_place,
                image_url: personalityData.image_url,
                bio: personalityData.bio,
                is_featured: false,
                visibility: 'public'
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Error inserting personality ${name}:`, insertError);
              errors.push({ name, error: insertError.message });
            } else {
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

async function fetchPersonalityData(searchTerm: string): Promise<PersonalityData | null> {
  try {
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
    if (wikipediaTitle) {
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
          return `${match[1]}-${match[2]}-${match[3]}`;
        }
      } catch (error) {
        console.error('Error formatting date:', error);
      }
      return null;
    };

    return {
      name,
      description,
      birth_date: formatDate(birthDate),
      death_date: formatDate(deathDate),
      profession: occupation, // Map occupation data to profession field
      nationality,
      birth_place: birthPlace,
      image_url: imageUrl,
      bio
    };

  } catch (error) {
    console.error('Error fetching personality data:', error);
    return null;
  }
}
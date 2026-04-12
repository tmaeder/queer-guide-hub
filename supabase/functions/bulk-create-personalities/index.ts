import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts';
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'
import { fetchOpenSanctionsData, fetchWikidataEntityLabel, formatWikidataDate, fetchTopBook, fetchUpcomingConcerts, WIKIDATA_USER_AGENT } from '../_shared/personality-fetcher.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

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
  next_concerts?: unknown[] | null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

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
      pexelsImages: sources.pexelsImages !== false,
      openSanctions: sources.openSanctions !== false
    };

    console.log(`Processing ${names.length} personality names with sources:`, sourceConfig);
    console.log('Input validation passed, starting processing...');

    const results = [];
    const errors = [];
    const batchSize = 10; // Process in smaller batches to avoid rate limiting
    const delayBetweenRequests = 1000; // 1 second delay between batches

    // Process names in batches
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(names.length / batchSize)} (${batch.length} names)`);
      
      for (const name of batch) {
      try {
        console.log(`Processing: ${name}`);
        
        // Fetch personality data using the same logic as fetch-personality-data
        const personalityData = await fetchPersonalityData(supabase, name.trim(), sourceConfig);
        
        console.log(`Data fetched for ${name}:`, personalityData ? 'success' : 'failed');
        
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
          errors.push({ name, error: 'No data found from external sources' });
        }
      } catch (error) {
        console.error(`Error processing ${name}:`, error);
        errors.push({ name, error: error.message });
      }
    }
    
    // Add delay between batches to respect rate limits
    if (i + batchSize < names.length) {
      console.log(`Waiting ${delayBetweenRequests}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchPersonalityData(supabaseClient: SupabaseClient, searchTerm: string, sources: unknown): Promise<PersonalityData | null> {
  try {
    if (!sources.wikidata) {
      console.log(`Wikidata source disabled for: ${searchTerm}`);
      return null;
    }

    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`Starting enhanced LGBTI-focused data fetch for: ${searchTerm}`);

    // Multi-source data collection including OpenSanctions
    const sourceData = {
      wikidata: null,
      openSanctions: null
    };

    // Search for the entity in Wikidata
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&format=json&limit=1`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': WIKIDATA_USER_AGENT
      }
    });
    
    if (!searchResponse.ok) {
      console.log(`Wikidata API error ${searchResponse.status} for: ${searchTerm}`);
      return null;
    }
    
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
        occupation = await fetchWikidataEntityLabel(occupationId);
      }
    }
    
    // Nationality (P27)
    const nationalityClaim = claims.P27?.[0];
    let nationality = '';
    if (nationalityClaim) {
      const nationalityId = nationalityClaim.mainsnak?.datavalue?.value?.id;
      if (nationalityId) {
        nationality = await fetchWikidataEntityLabel(nationalityId);
      }
    }
    
    // Birth place (P19)
    const birthPlaceClaim = claims.P19?.[0];
    let birthPlace: string | null = null;
    if (birthPlaceClaim) {
      const birthPlaceId = birthPlaceClaim.mainsnak?.datavalue?.value?.id;
      if (birthPlaceId) {
        const label = await fetchWikidataEntityLabel(birthPlaceId);
        birthPlace = label || null;
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

    // Fetch OpenSanctions data if enabled
    if (sources.openSanctions) {
      sourceData.openSanctions = await fetchOpenSanctionsData(name);
    }

    // Enhanced AI-powered LGBTI/queer community description generation with all source data
    const enhancedData = await enhanceWithLGBTIContext(supabaseClient, {
      name,
      description,
      bio,
      profession: occupation,
      nationality,
      birth_place: birthPlace,
      birth_date: formatWikidataDate(birthDate),
      death_date: formatWikidataDate(deathDate),
      is_living: !deathDate,
      openSanctionsData: sourceData.openSanctions
    });

    return {
      name: enhancedData.name,
      description: enhancedData.description,
      birth_date: enhancedData.birth_date,
      death_date: enhancedData.death_date,
      is_living: enhancedData.is_living,
      profession: enhancedData.profession,
      nationality: enhancedData.nationality,
      birth_place: enhancedData.birth_place,
      image_url: imageUrl,
      bio: enhancedData.bio,
      top_book: topBook,
      next_concerts: nextConcerts
    };

  } catch (error) {
    console.error('Error fetching personality data:', error);
    return null;
  }
}

async function enhanceWithLGBTIContext(supabaseClient: SupabaseClient, basicData: unknown): Promise<unknown> {
  try {
    if (!(await isOpenAIAvailable(supabaseClient))) {
      console.log('OpenAI not available, returning basic data');
      return basicData;
    }

    console.log(`Enhancing LGBTI context for: ${basicData.name}`);

    // Create a source-based prompt that strictly adheres to existing data
    const prompt = `You are an expert researcher specializing in LGBTI/queer history. Your task is to enhance biographical information while STRICTLY adhering to the provided source data and never contradicting it.

SOURCE DATA FOR: ${basicData.name}
===========================================
Description: ${basicData.description || 'Not provided'}
Biography: ${basicData.bio || 'Not provided'}
Profession: ${basicData.profession || 'Not specified'}
Nationality: ${basicData.nationality || 'Not specified'}
Birth Place: ${basicData.birth_place || 'Not specified'}
Birth Date: ${basicData.birth_date || 'Not specified'}
Death Date: ${basicData.death_date || 'Still living'}
Is Living: ${basicData.is_living}
OpenSanctions Data: ${basicData.openSanctionsData ? JSON.stringify(basicData.openSanctionsData, null, 2) : 'No sanctions data available'}

INSTRUCTIONS:
You MUST base your response ONLY on the source data provided above. Do NOT add, contradict, or modify any factual information. Your role is to:

1. Preserve all source facts exactly as stated
2. Only enhance with LGBTI context if it's explicitly mentioned or clearly implied in the source data
3. If no LGBTI connection is mentioned in sources, state that clearly

Please provide enhanced information in JSON format with these fields:
1. "name" - Keep exactly: ${basicData.name}
2. "description" - Rewrite the source description to be concise (1-2 sentences) while preserving all facts. Only mention LGBTI connection if explicitly stated in source
3. "bio" - Enhance the source biography by organizing it into 2-3 clear paragraphs while preserving ALL source facts. Only add LGBTI context if explicitly mentioned
4. "profession" - Use the profession from source data, do not modify
5. "lgbti_connection" - Based ONLY on source content: "community_member", "ally", "activist", "representation", "none_known", "unclear"
6. "lgbti_details" - ONLY include details that are explicitly mentioned in the source content

CRITICAL RULES:
- NEVER contradict source information
- NEVER add biographical facts not in source data
- NEVER assume LGBTI connections not explicitly mentioned
- If source doesn't mention LGBTI connection, clearly state "none_known"
- Preserve all source dates, places, and factual details exactly
- Only reorganize and clarify the existing source content
- If OpenSanctions data is available, accurately reflect any sanctions, PEP status, or regulatory information
- Be transparent about any compliance or regulatory concerns

Return ONLY valid JSON, no additional text.`;

    const aiResult = await chatCompletion(supabaseClient, {
      model: 'gpt-4.1-2025-04-14',
      messages: [
        { role: 'system', content: 'You are an expert LGBTI historian and researcher. Provide accurate, factual information about people\'s relationship to the LGBTI/queer community.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const enhancedContent = aiResult.content;

    try {
      // Remove potential markdown code blocks from AI response
      const cleanedResponse = enhancedContent.replace(/^```json\s*|\s*```$/g, '').trim();
      const enhancedData = JSON.parse(cleanedResponse);

      // Merge enhanced data with basic data, keeping all original fields
      return {
        ...basicData,
        name: enhancedData.name || basicData.name,
        description: enhancedData.description || basicData.description,
        bio: enhancedData.bio || basicData.bio,
        profession: enhancedData.profession || basicData.profession,
        lgbti_connection: enhancedData.lgbti_connection,
        lgbti_details: enhancedData.lgbti_details,
        sanctions_status: enhancedData.sanctions_status,
        regulatory_notes: enhancedData.regulatory_notes
      };
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.log('AI Response:', enhancedContent);
      return basicData;
    }

  } catch (error) {
    console.error('Error enhancing with LGBTI context:', error);
    return basicData;
  }
}


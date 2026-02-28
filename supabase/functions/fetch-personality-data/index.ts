import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { requireAdmin, getCorsHeaders } from '../_shared/supabase-client.ts';
import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts';

// Module-level reference for helper functions that need supabase access
let _supabaseClient: any = null;

interface WikidataSearchResult {
  id: string;
  title: string;
  description?: string;
}

interface PersonalityData {
  name: string;
  description: string;
  bio: string;
  birth_date: string;
  death_date: string;
  is_living: boolean;
  profession: string;
  nationality: string;
  birth_place: string;
  image_url: string;
  website_url: string;
  fields: string[];
  lgbti_connection?: string;
  lgbti_details?: string;
  sanctions_status?: string;
  regulatory_notes?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  try {
    // SECURITY: Require admin — this function calls multiple external APIs (Wikidata, OpenAI, etc.)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    _supabaseClient = supabase;
    const authResult = await requireAdmin(req, supabase);
    if (authResult instanceof Response) return authResult;

    const { searchTerm, selectedId } = await req.json()
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Search term must be at least 2 characters' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Starting enhanced LGBTI-focused search for:', searchTerm)

    let entityId = selectedId;
    
    if (!entityId) {
      // Step 1: Search Wikidata for the person
      const wikidataSearchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&type=item&format=json&limit=5`
      
      const wikidataResponse = await fetch(wikidataSearchUrl)
      const wikidataData = await wikidataResponse.json()
    
    if (!wikidataData.search || wikidataData.search.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No results found in Wikidata' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // If multiple results, return them with enhanced information for user selection
    if (wikidataData.search.length > 1) {
      const candidates = await Promise.all(
        wikidataData.search.slice(0, 5).map(async (result: WikidataSearchResult) => {
          try {
            // Get basic entity data for each candidate
            const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${result.id}&format=json&props=claims|labels|descriptions`;
            const entityResponse = await fetch(entityUrl);
            const entityData = await entityResponse.json();
            const entity = entityData.entities[result.id];
            
            if (!entity) {
              return {
                id: result.id,
                title: result.title,
                description: result.description || 'No description available',
                details: {}
              };
            }

            // Extract basic info for preview
            let birthYear = '';
            let deathYear = '';
            let profession = '';
            let nationality = '';

            // Birth date (P569)
            if (entity.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time) {
              const birthDate = entity.claims.P569[0].mainsnak.datavalue.value.time;
              birthYear = birthDate.substring(1, 5); // Extract year
            }

            // Death date (P570) 
            if (entity.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time) {
              const deathDate = entity.claims.P570[0].mainsnak.datavalue.value.time;
              deathYear = deathDate.substring(1, 5); // Extract year
            }

            // Occupation (P106) - get first one
            if (entity.claims?.P106?.[0]?.mainsnak?.datavalue?.value?.id) {
              const occupationId = entity.claims.P106[0].mainsnak.datavalue.value.id;
              try {
                const occupationUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${occupationId}&format=json&props=labels`;
                const occupationResponse = await fetch(occupationUrl);
                const occupationData = await occupationResponse.json();
                profession = occupationData.entities[occupationId]?.labels?.en?.value || '';
              } catch (e) {
                console.warn('Failed to fetch occupation for candidate:', e);
              }
            }

            // Country (P27) - get first one
            if (entity.claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id) {
              const countryId = entity.claims.P27[0].mainsnak.datavalue.value.id;
              try {
                const countryUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${countryId}&format=json&props=labels`;
                const countryResponse = await fetch(countryUrl);
                const countryData = await countryResponse.json();
                nationality = countryData.entities[countryId]?.labels?.en?.value || '';
              } catch (e) {
                console.warn('Failed to fetch country for candidate:', e);
              }
            }

            return {
              id: result.id,
              title: result.title,
              description: result.description || 'No description available',
              details: {
                birthYear,
                deathYear,
                profession,
                nationality,
                isLiving: !deathYear
              }
            };
          } catch (error) {
            console.warn(`Failed to fetch details for candidate ${result.id}:`, error);
            return {
              id: result.id,
              title: result.title,
              description: result.description || 'No description available',
              details: {}
            };
          }
        })
      );

      console.log(`Found ${candidates.length} candidates with details for: ${searchTerm}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          multiple_results: true,
          candidates,
          source: 'wikidata_search'
        }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

      // Get the single result
      const firstResult = wikidataData.search[0] as WikidataSearchResult
      entityId = firstResult.id;
    }
    
    console.log('Processing Wikidata entity:', entityId)

    // Step 2: Get detailed data from Wikidata
    const wikidataEntityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&format=json&props=claims|labels|descriptions|sitelinks`
    
    const entityResponse = await fetch(wikidataEntityUrl)
    const entityData = await entityResponse.json()
    
    const entity = entityData.entities[entityId]
    if (!entity) {
      throw new Error('Entity not found')
    }

    console.log('Processing entity data...')

    // Extract basic information
    const name = entity.labels?.en?.value || searchTerm
    const description = entity.descriptions?.en?.value || ''
    
    // Get Wikipedia page title if available
    let wikipediaTitle = ''
    if (entity.sitelinks?.enwiki) {
      wikipediaTitle = entity.sitelinks.enwiki.title
    }

    // Extract claims (properties)
    const claims = entity.claims || {}
    
    // Parse birth date (P569)
    let birthDate = ''
    if (claims.P569 && claims.P569[0]?.mainsnak?.datavalue) {
      const birthValue = claims.P569[0].mainsnak.datavalue.value
      if (birthValue.time) {
        // Convert Wikidata time format to ISO date
        birthDate = birthValue.time.substring(1, 11) // Remove + and get YYYY-MM-DD
      }
    }

    // Parse death date (P570)
    let deathDate = ''
    let isLiving = true
    if (claims.P570 && claims.P570[0]?.mainsnak?.datavalue) {
      const deathValue = claims.P570[0].mainsnak.datavalue.value
      if (deathValue.time) {
        deathDate = deathValue.time.substring(1, 11)
        isLiving = false
      }
    }

    // Parse occupation (P106)
    let profession = ''
    let fields: string[] = []
    if (claims.P106) {
      const occupations = []
      for (const occupation of claims.P106) {
        if (occupation.mainsnak?.datavalue?.value?.id) {
          const occupationId = occupation.mainsnak.datavalue.value.id
          // Get occupation label
          try {
            const occupationUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${occupationId}&format=json&props=labels`
            const occupationResponse = await fetch(occupationUrl)
            const occupationData = await occupationResponse.json()
            const occupationLabel = occupationData.entities[occupationId]?.labels?.en?.value
            if (occupationLabel) {
              occupations.push(occupationLabel)
              
              // Map to our field categories
              const fieldMapping: { [key: string]: string } = {
                'actor': 'entertainment',
                'actress': 'entertainment',
                'singer': 'music',
                'musician': 'music',
                'writer': 'literature',
                'author': 'literature',
                'politician': 'politics',
                'activist': 'activism',
                'artist': 'arts',
                'painter': 'arts',
                'scientist': 'science',
                'researcher': 'science',
                'journalist': 'journalism',
                'director': 'film',
                'producer': 'entertainment'
              }
              
              for (const [key, field] of Object.entries(fieldMapping)) {
                if (occupationLabel.toLowerCase().includes(key)) {
                  if (!fields.includes(field)) {
                    fields.push(field)
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Failed to fetch occupation label:', e)
          }
        }
      }
      profession = occupations.join(', ')
    }

    // Parse country of citizenship (P27)
    let nationality = ''
    if (claims.P27 && claims.P27[0]?.mainsnak?.datavalue?.value?.id) {
      const countryId = claims.P27[0].mainsnak.datavalue.value.id
      try {
        const countryUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${countryId}&format=json&props=labels`
        const countryResponse = await fetch(countryUrl)
        const countryData = await countryResponse.json()
        nationality = countryData.entities[countryId]?.labels?.en?.value || ''
      } catch (e) {
        console.warn('Failed to fetch country label:', e)
      }
    }

    // Parse place of birth (P19)
    let birthPlace = ''
    if (claims.P19 && claims.P19[0]?.mainsnak?.datavalue?.value?.id) {
      const placeId = claims.P19[0].mainsnak.datavalue.value.id
      try {
        const placeUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${placeId}&format=json&props=labels`
        const placeResponse = await fetch(placeUrl)
        const placeData = await placeResponse.json()
        birthPlace = placeData.entities[placeId]?.labels?.en?.value || ''
      } catch (e) {
        console.warn('Failed to fetch birth place label:', e)
      }
    }

    // Step 3: Get Wikipedia extract
    let bio = ''
    // Use Wikidata's official website property (P856) — never use Wikipedia article URL as website_url
    let websiteUrl = ''
    if (claims.P856 && claims.P856[0]?.mainsnak?.datavalue?.value) {
      websiteUrl = claims.P856[0].mainsnak.datavalue.value
    }
    if (wikipediaTitle) {
      try {
        const wikipediaUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(wikipediaTitle)}&prop=extracts&exintro=true&explaintext=true&exsectionformat=plain`
        const wikipediaResponse = await fetch(wikipediaUrl)
        const wikipediaData = await wikipediaResponse.json()

        const pages = wikipediaData.query?.pages
        if (pages) {
          const pageId = Object.keys(pages)[0]
          const extract = pages[pageId]?.extract
          if (extract && extract.length > 0) {
            // Take first 2 paragraphs or 500 characters, whichever is shorter
            bio = extract.substring(0, 500)
            if (bio.length === 500) {
              bio = bio.substring(0, bio.lastIndexOf('.') + 1)
            }
          }
        }
      } catch (e) {
        console.warn('Failed to fetch Wikipedia data:', e)
      }
    }

    // Step 4: Get image from Wikimedia Commons
    let imageUrl = ''
    if (claims.P18 && claims.P18[0]?.mainsnak?.datavalue?.value) {
      const imageFilename = claims.P18[0].mainsnak.datavalue.value
      try {
        // Get the actual file URL from Wikimedia Commons
        const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(imageFilename)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json`
        const imageResponse = await fetch(imageInfoUrl)
        const imageData = await imageResponse.json()
        
        const pages = imageData.query?.pages
        if (pages) {
          const pageId = Object.keys(pages)[0]
          const imageInfo = pages[pageId]?.imageinfo?.[0]
          if (imageInfo?.thumburl) {
            imageUrl = imageInfo.thumburl
          } else if (imageInfo?.url) {
            imageUrl = imageInfo.url
          }
        }
      } catch (e) {
        console.warn('Failed to fetch image:', e)
      }
    }

    // Step 5: Fetch Celebrity API data
    const celebrityData = await fetchCelebrityData(name);

    // Step 6: Fetch OpenSanctions data
    const openSanctionsData = await fetchOpenSanctionsData(name);

    // Step 7: Enhanced AI-powered LGBTI/queer community analysis
    const enhancedData = await enhanceWithLGBTIContext({
      name,
      description,
      bio,
      birth_date: birthDate,
      death_date: deathDate,
      is_living: isLiving,
      profession,
      nationality,
      birth_place: birthPlace,
      image_url: imageUrl,
      website_url: websiteUrl,
      fields,
      openSanctionsData,
      celebrityData
    });

    console.log('Returning enhanced personality data:', enhancedData)

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: enhancedData,
        source: 'wikidata_enhanced'
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error fetching personality data:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function enhanceWithLGBTIContext(basicData: any): Promise<PersonalityData> {
  try {
    if (!_supabaseClient || !(await isOpenAIAvailable(_supabaseClient))) {
      console.log('OpenAI not available, returning basic data');
      return basicData;
    }

    console.log(`Enhancing LGBTI context for: ${basicData.name}`);

    // Create a source-based prompt that strictly adheres to Wikipedia content
    const prompt = `You are an expert researcher specializing in LGBTI/queer history. Your task is to enhance biographical information while STRICTLY adhering to the provided Wikipedia content and never contradicting it.

WIKIPEDIA SOURCE DATA FOR: ${basicData.name}
===========================================
Description: ${basicData.description || 'Not provided'}
Biography from Wikipedia: ${basicData.bio || 'Not provided'}
Profession: ${basicData.profession || 'Not specified'}
Nationality: ${basicData.nationality || 'Not specified'}
Birth Place: ${basicData.birth_place || 'Not specified'}
Birth Date: ${basicData.birth_date || 'Not specified'}
Death Date: ${basicData.death_date || 'Still living'}
Is Living: ${basicData.is_living}
Website URL: ${basicData.website_url || 'Not provided'}

CELEBRITY API DATA (ADDITIONAL CONTEXT):
=========================================
${basicData.celebrityData ? JSON.stringify(basicData.celebrityData, null, 2) : 'No celebrity data available'}

OPENSANCTIONS DATA:
==================
${basicData.openSanctionsData ? JSON.stringify(basicData.openSanctionsData, null, 2) : 'No sanctions data available'}

INSTRUCTIONS:
You MUST base your response ONLY on the Wikipedia content provided above. The Celebrity API data can be used as additional context to cross-verify information, but NEVER contradict Wikipedia. Your role is to:

1. Preserve all Wikipedia facts exactly as stated
2. Only enhance with LGBTI context if it's explicitly mentioned or clearly implied in the Wikipedia content
3. Use Celebrity API data only to complement, never contradict Wikipedia
4. If no LGBTI connection is mentioned in Wikipedia, state that clearly

Please provide enhanced information in JSON format with these fields:
1. "name" - Keep exactly: ${basicData.name}
2. "description" - Rewrite the Wikipedia description to be concise (1-2 sentences) while preserving all facts. Only mention LGBTI connection if explicitly stated in Wikipedia
3. "bio" - Enhance the Wikipedia biography by organizing it into 2-3 clear paragraphs while preserving ALL Wikipedia facts. Only add LGBTI context if explicitly mentioned in the source
4. "profession" - Use the profession from Wikipedia data, do not modify
5. "lgbti_connection" - Based ONLY on Wikipedia content: "community_member", "ally", "activist", "representation", "none_known", "unclear"
6. "lgbti_details" - ONLY include details that are explicitly mentioned in the Wikipedia content
7. "fields" - Array based on Wikipedia profession/activities
8. "sanctions_status" - Based on OpenSanctions data if available
9. "regulatory_notes" - Based on OpenSanctions data if available

CRITICAL RULES:
- NEVER contradict Wikipedia information
- NEVER add biographical facts not in Wikipedia
- NEVER assume LGBTI connections not explicitly mentioned
- If Wikipedia doesn't mention LGBTI connection, clearly state "none_known"
- Preserve all Wikipedia dates, places, and factual details exactly
- Only reorganize and clarify the existing Wikipedia content
- Celebrity API data is ONLY for additional context, not primary facts

Return ONLY valid JSON, no additional text.`;

    const aiResult = await chatCompletion(_supabaseClient, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert LGBTI historian and researcher with access to comprehensive academic and community databases. Provide accurate, factual, well-researched information about people\'s relationship to the LGBTI/queer community. Always distinguish between documented facts and speculation.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200,
      temperature: 0.2
    });

    const enhancedContent = aiResult.content;

    try {
      // Remove potential markdown code blocks from AI response
      const cleanedResponse = enhancedContent.replace(/^```json\s*|\s*```$/g, '').trim();
      const enhancedData = JSON.parse(cleanedResponse);

      // Merge enhanced data with basic data, keeping all original fields
      return {
        name: enhancedData.name || basicData.name,
        description: enhancedData.description || basicData.description,
        bio: enhancedData.bio || basicData.bio,
        birth_date: basicData.birth_date,
        death_date: basicData.death_date,
        is_living: basicData.is_living,
        profession: enhancedData.profession || basicData.profession,
        nationality: basicData.nationality,
        birth_place: basicData.birth_place,
        image_url: basicData.image_url,
        website_url: basicData.website_url,
        fields: enhancedData.fields || basicData.fields,
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

async function fetchOpenSanctionsData(name: string): Promise<any | null> {
  try {
    console.log(`Fetching OpenSanctions data for: ${name}`);
    
    // Search OpenSanctions API
    const searchUrl = `https://api.opensanctions.org/search/default?q=${encodeURIComponent(name)}&limit=5`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)'
      }
    });

    if (!response.ok) {
      console.log(`OpenSanctions API returned ${response.status} for: ${name}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log(`No OpenSanctions results found for: ${name}`);
      return null;
    }

    // Find the best match (exact name match or highest score)
    let bestMatch = null;
    let bestScore = 0;

    for (const result of data.results) {
      const resultName = result.properties?.name?.[0] || '';
      const score = result.score || 0;
      
      // Prefer exact name matches
      if (resultName.toLowerCase() === name.toLowerCase()) {
        bestMatch = result;
        break;
      }
      
      // Otherwise, take the highest scoring result
      if (score > bestScore) {
        bestMatch = result;
        bestScore = score;
      }
    }

    if (!bestMatch) {
      console.log(`No suitable OpenSanctions match found for: ${name}`);
      return null;
    }

    console.log(`Found OpenSanctions match for ${name}: ${bestMatch.properties?.name?.[0] || 'Unknown'}`);
    
    return {
      id: bestMatch.id,
      schema: bestMatch.schema,
      properties: bestMatch.properties,
      datasets: bestMatch.datasets || [],
      first_seen: bestMatch.first_seen,
      last_seen: bestMatch.last_seen,
      score: bestMatch.score
    };

  } catch (error) {
    console.error(`Error fetching OpenSanctions data for ${name}:`, error);
    return null;
  }
}

async function fetchCelebrityData(name: string): Promise<any | null> {
  try {
    const apiNinjasKey = Deno.env.get('API_NINJAS_KEY');
    if (!apiNinjasKey) {
      console.log('API Ninjas key not found, skipping celebrity data');
      return null;
    }

    console.log(`Fetching Celebrity API data for: ${name}`);
    
    // Celebrity API from api-ninjas.com
    const celebrityUrl = `https://api.api-ninjas.com/v1/celebrity?name=${encodeURIComponent(name)}`;
    
    const response = await fetch(celebrityUrl, {
      headers: {
        'X-Api-Key': apiNinjasKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`Celebrity API returned ${response.status} for: ${name}`);
      return null;
    }

    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`No Celebrity API results found for: ${name}`);
      return null;
    }

    // Find the best match (exact name match first, then partial match)
    let bestMatch = null;
    
    for (const celebrity of data) {
      if (celebrity.name && celebrity.name.toLowerCase() === name.toLowerCase()) {
        bestMatch = celebrity;
        break;
      }
    }
    
    // If no exact match, take the first result
    if (!bestMatch && data.length > 0) {
      bestMatch = data[0];
    }

    if (!bestMatch) {
      console.log(`No suitable Celebrity API match found for: ${name}`);
      return null;
    }

    console.log(`Found Celebrity API match for ${name}: ${bestMatch.name || 'Unknown'}`);
    
    return {
      name: bestMatch.name,
      net_worth: bestMatch.net_worth,
      gender: bestMatch.gender,
      nationality: bestMatch.nationality,
      occupation: bestMatch.occupation,
      height: bestMatch.height,
      birthday: bestMatch.birthday,
      age: bestMatch.age,
      is_alive: bestMatch.is_alive
    };

  } catch (error) {
    console.error(`Error fetching Celebrity API data for ${name}:`, error);
    return null;
  }
}

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { searchTerm } = await req.json()
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Search term must be at least 2 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Starting enhanced LGBTI-focused search for:', searchTerm)

    // Step 1: Search Wikidata for the person
    const wikidataSearchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&type=item&format=json&limit=5`
    
    const wikidataResponse = await fetch(wikidataSearchUrl)
    const wikidataData = await wikidataResponse.json()
    
    if (!wikidataData.search || wikidataData.search.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No results found in Wikidata' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Get the first result (most relevant)
    const firstResult = wikidataData.search[0] as WikidataSearchResult
    console.log('Found Wikidata entity:', firstResult.id)

    // Step 2: Get detailed data from Wikidata
    const wikidataEntityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${firstResult.id}&format=json&props=claims|labels|descriptions|sitelinks`
    
    const entityResponse = await fetch(wikidataEntityUrl)
    const entityData = await entityResponse.json()
    
    const entity = entityData.entities[firstResult.id]
    if (!entity) {
      throw new Error('Entity not found')
    }

    console.log('Processing entity data...')

    // Extract basic information
    const name = entity.labels?.en?.value || firstResult.title
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
    let websiteUrl = ''
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
        
        // Set Wikipedia URL as website
        websiteUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaTitle)}`
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

    // Step 5: Fetch OpenSanctions data
    const openSanctionsData = await fetchOpenSanctionsData(name);

    // Step 6: Enhanced AI-powered LGBTI/queer community analysis
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
      openSanctionsData
    });

    console.log('Returning enhanced personality data:', enhancedData)

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: enhancedData,
        source: 'wikidata_enhanced'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error fetching personality data:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch data from Wikipedia/Wikidata',
        details: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function enhanceWithLGBTIContext(basicData: any): Promise<PersonalityData> {
  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.log('OpenAI API key not found, returning basic data');
      return basicData;
    }

    console.log(`Enhancing LGBTI context for: ${basicData.name}`);

    // Create a comprehensive prompt for LGBTI/queer community context with multiple source validation
    const prompt = `You are an expert researcher on LGBTI/queer history and notable figures with access to comprehensive databases. Your task is to enhance biographical information with accurate, well-researched details about a person's relationship to the LGBTI/queer community.

Person: ${basicData.name}
Current Description: ${basicData.description || 'Not available'}
Current Bio: ${basicData.bio || 'Not available'}
Profession: ${basicData.profession || 'Unknown'}
Nationality: ${basicData.nationality || 'Unknown'}
Birth Place: ${basicData.birth_place || 'Unknown'}
Birth Date: ${basicData.birth_date || 'Unknown'}
Death Date: ${basicData.death_date || 'Still living'}
Is Living: ${basicData.is_living}
OpenSanctions Data: ${basicData.openSanctionsData ? JSON.stringify(basicData.openSanctionsData, null, 2) : 'Not available'}

Please provide enhanced information in JSON format with these fields:
1. "name" - Keep the exact same name
2. "description" - A concise 1-2 sentence description that MUST accurately include their relationship to the LGBTI/queer community if they are part of it, their identity if publicly known, or clearly state if they are not known to be part of the community
3. "bio" - An enhanced 2-3 paragraph biography that accurately describes:
   - Their LGBTI/queer identity (if publicly known and relevant)
   - Their contributions to LGBTI/queer rights, visibility, or community (if applicable)
   - Their allyship/support work (if applicable)
   - Their professional achievements in relation to LGBTI representation
   - Or clearly states they are not known to be connected to the LGBTI community (if that's the case)
4. "profession" - Enhanced profession description
5. "lgbti_connection" - One of: "community_member", "ally", "activist", "representation", "none_known", "unclear"
6. "lgbti_details" - Specific, factual details about their LGBTI identity, activism, or contributions (if any)
7. "fields" - Array of relevant fields/categories for their work
8. "sanctions_status" - Information about any sanctions, PEP status, or regulatory concerns from OpenSanctions (if applicable)
9. "regulatory_notes" - Any relevant regulatory or compliance information

CRITICAL REQUIREMENTS FOR ACCURACY:
- Cross-reference information from multiple reliable sources mentally
- Be factually accurate - NEVER invent or assume LGBTI connections that don't exist
- If someone is not known to be LGBTI or an ally, clearly state that in both description and bio
- Include specific examples of their LGBTI advocacy, visibility, or community contributions where they exist
- For historical figures, consider the context of their time period and coded language/relationships
- Use respectful, contemporary terminology for identities and orientations
- Distinguish between confirmed public identities and historical speculation
- Include their impact on LGBTI rights, representation, or community building where applicable
- Note if their LGBTI status is disputed, private, or speculative
- If OpenSanctions data is available, accurately reflect any sanctions, PEP status, or regulatory information
- Be transparent about any compliance or regulatory concerns

VALIDATION APPROACH:
- Consider multiple biographical sources
- Look for patterns in historical documentation
- Distinguish between well-documented facts and scholarly theories
- Consider the reliability and bias of different source types

Return ONLY valid JSON, no additional text.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: 'You are an expert LGBTI historian and researcher with access to comprehensive academic and community databases. Provide accurate, factual, well-researched information about people\'s relationship to the LGBTI/queer community. Always distinguish between documented facts and speculation.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1200,
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status}`);
      return basicData;
    }

    const aiResponse = await response.json();
    const enhancedContent = aiResponse.choices[0].message.content;

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

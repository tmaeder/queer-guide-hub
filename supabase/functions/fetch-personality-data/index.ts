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

    console.log('Searching for:', searchTerm)

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

    const personalityData: PersonalityData = {
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
      fields
    }

    console.log('Returning personality data:', personalityData)

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: personalityData,
        source: 'wikidata'
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
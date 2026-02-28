import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // SECURITY: Require admin for sync operations
    const serviceClient = getServiceClient()
    const authResult = await requireAdmin(req, serviceClient)
    if (authResult instanceof Response) return authResult

    const { index, operation = 'sync', records } = await req.json()

    // Get Algolia credentials
    const algoliaAppId = Deno.env.get('ALGOLIA_APP_ID')
    const algoliaApiKey = Deno.env.get('ALGOLIA_API_KEY') // Admin API key for write operations

    if (!algoliaAppId || !algoliaApiKey) {
      return new Response(
        JSON.stringify({ error: 'Algolia credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Use fetch-based approach for Deno compatibility
    const algoliaBaseUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes`

    // Helper function to save objects to an index
    const saveObjectsToIndex = async (indexName: string, records: any[]) => {
      const response = await fetch(`${algoliaBaseUrl}/${indexName}/batch`, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': algoliaAppId,
          'X-Algolia-API-Key': algoliaApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: records.map(record => ({
            action: 'updateObject',
            body: record
          }))
        })
      })

      if (!response.ok) {
        throw new Error(`Algolia sync failed: ${response.statusText}`)
      }

      return response.json()
    }

    const client = { saveObjectsToIndex }

    if (operation === 'sync') {
      // Sync all data for specified index
      await syncIndexData(client, supabase, index)
    } else if (operation === 'update' && records) {
      // Update specific records
      await updateRecords(client, index, records)
    }

    return new Response(
      JSON.stringify({ success: true, message: `${operation} completed for ${index}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Algolia sync error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function syncIndexData(client: any, supabase: any, indexName: string) {
  switch (indexName) {
    case 'venues':
      await syncVenues(client, supabase, indexName)
      break
    case 'events':
      await syncEvents(client, supabase, indexName)
      break
    case 'users':
      await syncUsers(client, supabase, indexName)
      break
    case 'news':
      await syncNews(client, supabase, indexName)
      break
    case 'marketplace':
      await syncMarketplace(client, supabase, indexName)
      break
    case 'locations':
      await syncLocations(client, supabase, indexName)
      break
    case 'personalities':
      await syncPersonalities(client, supabase, indexName)
      break
    default:
      throw new Error(`Unknown index: ${indexName}`)
  }
}

async function syncVenues(client: any, supabase: any, indexName: string) {
  const { data: venues, error } = await supabase
    .from('venues')
    .select(`
      *,
      cities(name, country_id),
      countries(name),
      venue_categories(name)
    `)
    .eq('is_active', true)

  if (error) throw error

  const records = venues.map((venue: any) => ({
    objectID: venue.id,
    title: venue.name,
    description: venue.description,
    type: 'venue',
    category: venue.venue_categories?.name,
    location: `${venue.cities?.name}, ${venue.countries?.name}`,
    rating: venue.average_rating,
    image_url: venue.image_url,
    address: venue.address,
    latitude: venue.latitude,
    longitude: venue.longitude,
    verified: venue.is_verified,
    featured: venue.is_featured,
    tags: venue.tags || []
  }))

  await client.saveObjectsToIndex(indexName, records)
}

async function syncEvents(client: any, supabase: any, indexName: string) {
  const { data: events, error } = await supabase
    .from('events')
    .select(`
      *,
      venues(name, address),
      cities(name, country_id),
      countries(name),
      event_types(name)
    `)
    .eq('is_active', true)

  if (error) throw error

  const records = events.map((event: any) => ({
    objectID: event.id,
    title: event.title,
    description: event.description,
    type: 'event',
    category: event.event_types?.name,
    location: event.venues?.address || `${event.cities?.name}, ${event.countries?.name}`,
    date: event.start_date,
    price: event.price,
    image_url: event.image_url,
    venue_name: event.venues?.name,
    start_date: event.start_date,
    end_date: event.end_date,
    featured: event.is_featured,
    tags: event.tags || []
  }))

  await client.saveObjectsToIndex(indexName, records)
}

async function syncUsers(client: any, supabase: any, indexName: string) {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(`
      *,
      cities(name, country_id),
      countries(name)
    `)
    .eq('is_public', true)

  if (error) throw error

  const records = profiles.map((profile: any) => ({
    objectID: profile.user_id,
    title: profile.display_name || profile.username,
    description: profile.bio,
    type: 'user',
    location: `${profile.cities?.name}, ${profile.countries?.name}`,
    avatar_url: profile.avatar_url,
    verified: profile.is_verified,
    profession: profile.profession,
    age: profile.age,
    interests: profile.interests || []
  }))

  await client.saveObjectsToIndex(indexName, records)
}

async function syncNews(client: any, supabase: any, indexName: string) {
  const { data: news, error } = await supabase
    .from('news_articles')
    .select('*')
    .eq('is_published', true)

  if (error) throw error

  const records = news.map((article: any) => ({
    objectID: article.id,
    title: article.headline,
    description: article.summary,
    content: article.content,
    type: 'news',
    category: article.category,
    location: article.location,
    image_url: article.image_url,
    published_at: article.published_at,
    source: article.source,
    tags: article.tags || []
  }))

  await client.saveObjectsToIndex(indexName, records)
}

async function syncMarketplace(client: any, supabase: any, indexName: string) {
  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select(`
      *,
      profiles(display_name),
      cities(name, country_id),
      countries(name)
    `)
    .eq('is_active', true)

  if (error) throw error

  const records = listings.map((listing: any) => ({
    objectID: listing.id,
    title: listing.title,
    description: listing.description,
    type: 'marketplace',
    category: listing.category,
    location: `${listing.cities?.name}, ${listing.countries?.name}`,
    price: listing.price,
    image_url: listing.image_url,
    seller: listing.profiles?.display_name,
    condition: listing.condition,
    featured: listing.is_featured
  }))

  await client.saveObjectsToIndex(indexName, records)
}

async function syncLocations(client: any, supabase: any, indexName: string) {
  // Sync cities
  const { data: cities, error: citiesError } = await supabase
    .from('cities')
    .select(`
      *,
      countries(name, iso_code)
    `)

  if (citiesError) throw citiesError

  const cityRecords = cities.map((city: any) => ({
    objectID: `city_${city.id}`,
    title: city.name,
    description: city.description,
    type: 'location',
    location: city.countries?.name,
    image_url: city.image_url,
    country: city.countries?.name,
    country_code: city.countries?.iso_code,
    is_country: false,
    latitude: city.latitude,
    longitude: city.longitude
  }))

  // Sync countries
  const { data: countries, error: countriesError } = await supabase
    .from('countries')
    .select('*')

  if (countriesError) throw countriesError

  const countryRecords = countries.map((country: any) => ({
    objectID: `country_${country.id}`,
    title: country.name,
    description: country.description,
    type: 'location',
    image_url: country.flag_url,
    country_code: country.iso_code,
    is_country: true,
    continent: country.continent
  }))

  await client.saveObjectsToIndex(indexName, [...cityRecords, ...countryRecords])
}

async function syncPersonalities(client: any, supabase: any, indexName: string) {
  const { data: personalities, error } = await supabase
    .from('personalities')
    .select('*')
    .eq('is_active', true)

  if (error) throw error

  const records = personalities.map((personality: any) => ({
    objectID: personality.id,
    title: personality.name,
    description: personality.bio,
    type: 'personality',
    category: personality.category,
    image_url: personality.image_url,
    profession: personality.profession,
    birth_date: personality.birth_date,
    nationality: personality.nationality,
    verified: personality.is_verified,
    tags: personality.tags || []
  }))

  await client.saveObjectsToIndex(indexName, records)
}

async function updateRecords(client: any, indexName: string, records: any[]) {
  await client.saveObjectsToIndex(indexName, records)
}

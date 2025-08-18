import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
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

    // Import Algolia
    const { algoliasearch } = await import('https://esm.sh/algoliasearch@5')
    const client = algoliasearch(algoliaAppId, algoliaApiKey)

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
      JSON.stringify({ error: 'Sync failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function syncIndexData(client: any, supabase: any, indexName: string) {
  const algoliaIndex = client.initIndex(indexName)
  
  switch (indexName) {
    case 'venues':
      await syncVenues(algoliaIndex, supabase)
      break
    case 'events':
      await syncEvents(algoliaIndex, supabase)
      break
    case 'users':
      await syncUsers(algoliaIndex, supabase)
      break
    case 'news':
      await syncNews(algoliaIndex, supabase)
      break
    case 'marketplace':
      await syncMarketplace(algoliaIndex, supabase)
      break
    case 'locations':
      await syncLocations(algoliaIndex, supabase)
      break
    case 'personalities':
      await syncPersonalities(algoliaIndex, supabase)
      break
    default:
      throw new Error(`Unknown index: ${indexName}`)
  }
}

async function syncVenues(index: any, supabase: any) {
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

  await index.saveObjects(records)
}

async function syncEvents(index: any, supabase: any) {
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

  await index.saveObjects(records)
}

async function syncUsers(index: any, supabase: any) {
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

  await index.saveObjects(records)
}

async function syncNews(index: any, supabase: any) {
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

  await index.saveObjects(records)
}

async function syncMarketplace(index: any, supabase: any) {
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

  await index.saveObjects(records)
}

async function syncLocations(index: any, supabase: any) {
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

  await index.saveObjects([...cityRecords, ...countryRecords])
}

async function syncPersonalities(index: any, supabase: any) {
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

  await index.saveObjects(records)
}

async function updateRecords(client: any, indexName: string, records: any[]) {
  const index = client.initIndex(indexName)
  await index.saveObjects(records)
}
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlgoliaRecord {
  objectID: string;
  [key: string]: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const algoliaAppId = Deno.env.get('ALGOLIA_APPLICATION_ID');
    const algoliaApiKey = Deno.env.get('ALGOLIA_API_KEY');

    console.log('Environment check:', {
      supabaseUrl: !!supabaseUrl,
      supabaseServiceKey: !!supabaseServiceKey,
      algoliaAppId: !!algoliaAppId,
      algoliaApiKey: !!algoliaApiKey
    });

    if (!algoliaAppId || !algoliaApiKey) {
      console.error('Missing Algolia credentials');
      return new Response(
        JSON.stringify({ 
          error: 'Algolia credentials not configured. Please add ALGOLIA_APPLICATION_ID and ALGOLIA_API_KEY to your Supabase secrets.',
          configured: false
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { tables = 'all' } = await req.json().catch(() => ({ tables: 'all' }));

    console.log(`Starting comprehensive Algolia sync for: ${tables}`);

    // Initialize Algolia headers
    const algoliaHeaders = {
      'X-Algolia-Application-Id': algoliaAppId,
      'X-Algolia-API-Key': algoliaApiKey,
      'Content-Type': 'application/json',
    };

    const results: any = {
      success: true,
      synced_tables: [],
      total_records: 0,
      errors: []
    };

    // Sync all data tables
    if (tables === 'all' || tables.includes('tags')) {
      try {
        const tagResult = await syncTags(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('tags');
        results.total_records += tagResult.count;
      } catch (error) {
        results.errors.push(`Tags: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('venues')) {
      try {
        const venueResult = await syncVenues(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('venues');
        results.total_records += venueResult.count;
      } catch (error) {
        results.errors.push(`Venues: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('events')) {
      try {
        const eventResult = await syncEvents(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('events');
        results.total_records += eventResult.count;
      } catch (error) {
        results.errors.push(`Events: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('marketplace')) {
      try {
        const marketplaceResult = await syncMarketplace(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('marketplace');
        results.total_records += marketplaceResult.count;
      } catch (error) {
        results.errors.push(`Marketplace: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('community')) {
      try {
        const communityResult = await syncCommunityPosts(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('community_posts');
        results.total_records += communityResult.count;
      } catch (error) {
        results.errors.push(`Community: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('countries')) {
      try {
        const countryResult = await syncCountries(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('countries');
        results.total_records += countryResult.count;
      } catch (error) {
        results.errors.push(`Countries: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('cities')) {
      try {
        const cityResult = await syncCities(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('cities');
        results.total_records += cityResult.count;
      } catch (error) {
        results.errors.push(`Cities: ${error.message}`);
      }
    }

    if (tables === 'all' || tables.includes('news')) {
      try {
        const newsResult = await syncNews(supabase, algoliaAppId, algoliaHeaders);
        results.synced_tables.push('news_articles');
        results.total_records += newsResult.count;
      } catch (error) {
        results.errors.push(`News: ${error.message}`);
      }
    }

    console.log('Sync completed:', results);

    return new Response(
      JSON.stringify({
        ...results,
        message: `Successfully synced ${results.total_records} records across ${results.synced_tables.length} tables`,
        processed_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in comprehensive Algolia sync:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function syncTags(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing tags...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/tags`;
  
  const { data: tags, error } = await supabase
    .from('unified_tags')
    .select('*')
    .order('usage_count', { ascending: false });

  if (error) throw error;

  const algoliaRecords = tags?.map((tag: any) => ({
    objectID: tag.id,
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    category: tag.category,
    color: tag.color,
    usage_count: tag.usage_count || 0,
    created_at: tag.created_at,
    updated_at: tag.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncVenues(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing venues...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/venues`;
  
  const { data: venues, error } = await supabase
    .from('venues')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const algoliaRecords = venues?.map((venue: any) => ({
    objectID: venue.id,
    id: venue.id,
    name: venue.name,
    description: venue.description,
    address: venue.address,
    city: venue.city,
    country: venue.country,
    category: venue.category,
    tags: venue.tags || [],
    latitude: venue.latitude,
    longitude: venue.longitude,
    phone: venue.phone,
    website: venue.website,
    rating: venue.rating,
    price_range: venue.price_range,
    accessibility_features: venue.accessibility_features || [],
    created_at: venue.created_at,
    updated_at: venue.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncEvents(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing events...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/events`;
  
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .gte('end_date', new Date().toISOString()) // Only future events
    .order('start_date', { ascending: true });

  if (error) throw error;

  const algoliaRecords = events?.map((event: any) => ({
    objectID: event.id,
    id: event.id,
    title: event.title,
    description: event.description,
    event_type: event.event_type,
    start_date: event.start_date,
    end_date: event.end_date,
    venue_name: event.venue_name,
    address: event.address,
    city: event.city,
    country: event.country,
    latitude: event.latitude,
    longitude: event.longitude,
    price_min: event.price_min,
    price_max: event.price_max,
    is_free: event.is_free,
    target_groups: event.target_groups || [],
    accessibility_attributes: event.accessibility_attributes || [],
    organizer_name: event.organizer_name,
    website: event.website,
    ticket_url: event.ticket_url,
    featured: event.featured,
    created_at: event.created_at,
    updated_at: event.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncMarketplace(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing marketplace listings...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/marketplace_listings`;
  
  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const algoliaRecords = listings?.map((listing: any) => ({
    objectID: listing.id,
    id: listing.id,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    subcategory: listing.subcategory,
    business_name: listing.business_name,
    business_type: listing.business_type,
    price: listing.price,
    price_type: listing.price_type,
    currency: listing.currency,
    location: listing.location,
    contact_email: listing.contact_email,
    contact_phone: listing.contact_phone,
    website: listing.website,
    shipping_available: listing.shipping_available,
    featured: listing.featured,
    views_count: listing.views_count || 0,
    created_at: listing.created_at,
    updated_at: listing.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncCommunityPosts(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing community posts...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/community_posts`;
  
  const { data: posts, error } = await supabase
    .from('community_posts')
    .select(`
      *,
      profiles:user_id(display_name, avatar_url)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(1000); // Limit to recent posts

  if (error) throw error;

  const algoliaRecords = posts?.map((post: any) => ({
    objectID: post.id,
    id: post.id,
    content: post.content,
    post_type: post.post_type,
    tags: post.tags || [],
    likes_count: post.likes_count || 0,
    comments_count: post.comments_count || 0,
    author_name: post.profiles?.display_name || 'Anonymous',
    author_avatar: post.profiles?.avatar_url,
    visibility: post.visibility,
    pinned: post.pinned,
    created_at: post.created_at,
    updated_at: post.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncCountries(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing countries...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/countries`;
  
  const { data: countries, error } = await supabase
    .from('countries')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;

  const algoliaRecords = countries?.map((country: any) => ({
    objectID: country.id,
    id: country.id,
    name: country.name,
    code: country.code,
    capital: country.capital,
    description: country.description,
    flag_emoji: country.flag_emoji,
    population: country.population,
    area_km2: country.area_km2,
    languages: country.languages || [],
    currency: country.currency,
    calling_code: country.calling_code,
    lgbt_legal_status: country.lgbt_legal_status,
    lgbt_rights_status: country.lgbt_rights_status,
    lgbti_same_sex_unions: country.lgbti_same_sex_unions,
    lgbti_adoption_rights: country.lgbti_adoption_rights,
    continent_id: country.continent_id,
    created_at: country.created_at,
    updated_at: country.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncCities(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing cities...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/cities`;
  
  const { data: cities, error } = await supabase
    .from('cities')
    .select(`
      *,
      countries:country_id(name, code, flag_emoji)
    `)
    .order('population', { ascending: false, nullsLast: true });

  if (error) throw error;

  const algoliaRecords = cities?.map((city: any) => ({
    objectID: city.id,
    id: city.id,
    name: city.name,
    description: city.description,
    country_name: city.countries?.name,
    country_code: city.countries?.code,
    country_flag: city.countries?.flag_emoji,
    region_name: city.region_name,
    population: city.population,
    area_km2: city.area_km2,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
    is_capital: city.is_capital,
    is_major_city: city.is_major_city,
    lgbt_friendly_rating: city.lgbt_friendly_rating,
    climate_type: city.climate_type,
    notable_landmarks: city.notable_landmarks || [],
    universities: city.universities || [],
    major_airports: city.major_airports || [],
    airport_codes: city.airport_codes || [],
    created_at: city.created_at,
    updated_at: city.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function syncNews(supabase: any, algoliaAppId: string, headers: any) {
  console.log('Syncing news articles...');
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/news_articles`;
  
  const { data: articles, error } = await supabase
    .from('news_articles')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(1000); // Recent articles only

  if (error) throw error;

  const algoliaRecords = articles?.map((article: any) => ({
    objectID: article.id,
    id: article.id,
    title: article.title,
    summary: article.summary,
    source: article.source,
    source_url: article.source_url,
    published_at: article.published_at,
    tags: article.tags || [],
    category: article.category,
    language: article.language,
    country_id: article.country_id,
    city_id: article.city_id,
    views_count: article.views_count || 0,
    created_at: article.created_at,
    updated_at: article.updated_at,
  })) || [];

  if (algoliaRecords.length > 0) {
    await batchUploadToAlgolia(indexUrl, headers, algoliaRecords);
  }

  return { count: algoliaRecords.length };
}

async function batchUploadToAlgolia(indexUrl: string, headers: any, records: AlgoliaRecord[]) {
  console.log(`Uploading ${records.length} records to ${indexUrl}`);
  
  const response = await fetch(`${indexUrl}/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: records.map(record => ({
        action: 'updateObject',
        body: record
      }))
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to Algolia: ${response.status} - ${errorText}`);
  }

  console.log(`Successfully uploaded ${records.length} records`);
  return response.json();
}
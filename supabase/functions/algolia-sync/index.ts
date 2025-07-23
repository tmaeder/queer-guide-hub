import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Environment variables
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

    // Check if Algolia is configured
    if (!algoliaAppId || !algoliaApiKey) {
      console.log('Algolia not configured, returning configuration error');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Algolia credentials not configured',
          message: 'Please add ALGOLIA_APPLICATION_ID and ALGOLIA_API_KEY to your Supabase Edge Functions secrets.',
          configured: false
        }),
        { 
          status: 200, // Return 200 to avoid edge function errors
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { action = 'sync_all' } = await req.json().catch(() => ({ action: 'sync_all' }));
    console.log(`Starting Algolia sync action: ${action}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results = {
      success: true,
      synced_tables: [],
      total_records: 0,
      errors: [],
      configured: true
    };

    // Sync tags (always included)
    try {
      const tagCount = await syncTags(supabase, algoliaAppId, algoliaApiKey);
      results.synced_tables.push('tags');
      results.total_records += tagCount;
      console.log(`Synced ${tagCount} tags`);
    } catch (error) {
      console.error('Error syncing tags:', error);
      results.errors.push(`Tags: ${error.message}`);
    }

    // Only sync other tables if action is sync_all
    if (action === 'sync_all') {
      // Sync venues
      try {
        const venueCount = await syncVenues(supabase, algoliaAppId, algoliaApiKey);
        results.synced_tables.push('venues');
        results.total_records += venueCount;
        console.log(`Synced ${venueCount} venues`);
      } catch (error) {
        console.error('Error syncing venues:', error);
        results.errors.push(`Venues: ${error.message}`);
      }

      // Sync events
      try {
        const eventCount = await syncEvents(supabase, algoliaAppId, algoliaApiKey);
        results.synced_tables.push('events');
        results.total_records += eventCount;
        console.log(`Synced ${eventCount} events`);
      } catch (error) {
        console.error('Error syncing events:', error);
        results.errors.push(`Events: ${error.message}`);
      }

      // Sync marketplace
      try {
        const marketplaceCount = await syncMarketplace(supabase, algoliaAppId, algoliaApiKey);
        results.synced_tables.push('marketplace');
        results.total_records += marketplaceCount;
        console.log(`Synced ${marketplaceCount} marketplace listings`);
      } catch (error) {
        console.error('Error syncing marketplace:', error);
        results.errors.push(`Marketplace: ${error.message}`);
      }
    }

    console.log('Sync completed:', results);

    return new Response(
      JSON.stringify({
        ...results,
        message: `Successfully synced ${results.total_records} records across ${results.synced_tables.length} tables`,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Algolia sync function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        configured: true
      }),
      { 
        status: 200, // Return 200 to avoid edge function errors
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function syncTags(supabase: any, algoliaAppId: string, algoliaApiKey: string): Promise<number> {
  console.log('Syncing tags to Algolia...');
  
  const { data: tags, error } = await supabase
    .from('unified_tags')
    .select('*')
    .order('usage_count', { ascending: false });

  if (error) {
    console.error('Error fetching tags:', error);
    throw new Error(`Failed to fetch tags: ${error.message}`);
  }

  if (!tags || tags.length === 0) {
    console.log('No tags found to sync');
    return 0;
  }

  const records = tags.map((tag: any) => ({
    objectID: tag.id,
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description || '',
    category: tag.category || 'general',
    color: tag.color || '#6366f1',
    usage_count: tag.usage_count || 0,
    image_url: tag.image_url || null,
    created_at: tag.created_at,
    updated_at: tag.updated_at,
  }));

  await uploadToAlgolia(algoliaAppId, algoliaApiKey, 'tags', records);
  return records.length;
}

async function syncVenues(supabase: any, algoliaAppId: string, algoliaApiKey: string): Promise<number> {
  console.log('Syncing venues to Algolia...');
  
  const { data: venues, error } = await supabase
    .from('venues')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching venues:', error);
    throw new Error(`Failed to fetch venues: ${error.message}`);
  }

  if (!venues || venues.length === 0) {
    console.log('No venues found to sync');
    return 0;
  }

  const records = venues.map((venue: any) => ({
    objectID: venue.id,
    id: venue.id,
    name: venue.name || '',
    description: venue.description || '',
    address: venue.address || '',
    city: venue.city || '',
    country: venue.country || '',
    category: venue.category || 'general',
    latitude: venue.latitude,
    longitude: venue.longitude,
    phone: venue.phone || '',
    website: venue.website || '',
    rating: venue.rating || 0,
    images: venue.images || [],
    image_url: venue.image_url || null,
    created_at: venue.created_at,
    updated_at: venue.updated_at,
  }));

  await uploadToAlgolia(algoliaAppId, algoliaApiKey, 'venues', records);
  return records.length;
}

async function syncEvents(supabase: any, algoliaAppId: string, algoliaApiKey: string): Promise<number> {
  console.log('Syncing events to Algolia...');
  
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .gte('end_date', new Date().toISOString())
    .order('start_date', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    throw new Error(`Failed to fetch events: ${error.message}`);
  }

  if (!events || events.length === 0) {
    console.log('No events found to sync');
    return 0;
  }

  const records = events.map((event: any) => ({
    objectID: event.id,
    id: event.id,
    title: event.title || '',
    description: event.description || '',
    event_type: event.event_type || 'general',
    start_date: event.start_date,
    end_date: event.end_date,
    venue_name: event.venue_name || '',
    city: event.city || '',
    country: event.country || '',
    is_free: event.is_free || false,
    featured: event.featured || false,
    images: event.images || [],
    created_at: event.created_at,
    updated_at: event.updated_at,
  }));

  await uploadToAlgolia(algoliaAppId, algoliaApiKey, 'events', records);
  return records.length;
}

async function syncMarketplace(supabase: any, algoliaAppId: string, algoliaApiKey: string): Promise<number> {
  console.log('Syncing marketplace to Algolia...');
  
  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching marketplace listings:', error);
    throw new Error(`Failed to fetch marketplace listings: ${error.message}`);
  }

  if (!listings || listings.length === 0) {
    console.log('No marketplace listings found to sync');
    return 0;
  }

  const records = listings.map((listing: any) => ({
    objectID: listing.id,
    id: listing.id,
    title: listing.title || '',
    description: listing.description || '',
    category: listing.category || 'general',
    business_name: listing.business_name || '',
    price: listing.price || 0,
    currency: listing.currency || 'USD',
    location: listing.location || '',
    featured: listing.featured || false,
    images: listing.images || [],
    created_at: listing.created_at,
    updated_at: listing.updated_at,
  }));

  await uploadToAlgolia(algoliaAppId, algoliaApiKey, 'marketplace', records);
  return records.length;
}

async function uploadToAlgolia(algoliaAppId: string, algoliaApiKey: string, indexName: string, records: any[]): Promise<void> {
  const indexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/${indexName}`;
  
  console.log(`Uploading ${records.length} records to ${indexUrl}`);
  
  const response = await fetch(`${indexUrl}/batch`, {
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Algolia upload failed:', response.status, errorText);
    throw new Error(`Algolia upload failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`Successfully uploaded ${records.length} records to ${indexName}:`, result);
}
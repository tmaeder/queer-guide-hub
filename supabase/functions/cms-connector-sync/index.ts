import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConnectorConfig {
  connectorId: string;
  provider: string;
  config: any;
}

async function syncWikidata(config: any) {
  console.log('Starting Wikidata sync with config:', config);
  
  const results = [];
  let processedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  // Process each query defined in the config
  for (const [queryName, sparqlQuery] of Object.entries(config.queries || {})) {
    try {
      console.log(`Executing query: ${queryName}`);
      
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'QueerGuide-CMS/1.0',
        },
        body: sparqlQuery as string,
      });

      if (!response.ok) {
        throw new Error(`Wikidata API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`Query ${queryName} returned ${data.results?.bindings?.length || 0} results`);

      // Process results
      for (const binding of data.results?.bindings || []) {
        try {
          processedCount++;
          
          // Transform Wikidata result to our content format
          const contentData = {
            title: { en: binding.itemLabel?.value || 'Untitled' },
            description: { en: binding.description?.value || '' },
            content_type: queryName.includes('event') ? 'events' : 'venues',
            content_data: {
              wikidata_id: binding.item?.value,
              coordinates: binding.coords?.value,
              location: binding.location?.value,
              start_time: binding.startTime?.value,
              end_time: binding.endTime?.value,
              source: 'wikidata',
              last_updated: new Date().toISOString(),
            },
            workflow_state: 'draft',
            visibility_level: 'public',
            tags: ['imported', 'wikidata', 'lgbtq'],
            source_metadata: {
              provider: 'wikidata',
              original_url: binding.item?.value,
              import_date: new Date().toISOString(),
            },
          };

          results.push(contentData);
          createdCount++;
        } catch (error) {
          console.error('Error processing binding:', error);
          failedCount++;
        }
      }
    } catch (error) {
      console.error(`Error executing query ${queryName}:`, error);
      failedCount++;
    }
  }

  return {
    success: true,
    records_processed: processedCount,
    records_created: createdCount,
    records_updated: updatedCount,
    records_failed: failedCount,
    data: results,
  };
}

async function syncOpenStreetMap(config: any) {
  console.log('Starting OpenStreetMap sync with config:', config);
  
  const results = [];
  let processedCount = 0;
  let createdCount = 0;
  let failedCount = 0;

  try {
    const response = await fetch(config.overpass_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(config.queries.lgbtq_venues)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`OSM query returned ${data.elements?.length || 0} results`);

    for (const element of data.elements || []) {
      try {
        processedCount++;

        const contentData = {
          title: { en: element.tags?.name || element.tags?.amenity || 'Unnamed Venue' },
          description: { en: element.tags?.description || `${element.tags?.amenity || 'Venue'} from OpenStreetMap` },
          content_type: 'venues',
          content_data: {
            osm_id: element.id,
            osm_type: element.type,
            coordinates: element.lat && element.lon ? [element.lon, element.lat] : null,
            tags: element.tags,
            source: 'openstreetmap',
            last_updated: new Date().toISOString(),
          },
          workflow_state: 'draft',
          visibility_level: 'public',
          tags: ['imported', 'openstreetmap', 'lgbtq', 'venue'],
          source_metadata: {
            provider: 'openstreetmap',
            osm_id: element.id,
            osm_type: element.type,
            import_date: new Date().toISOString(),
          },
        };

        results.push(contentData);
        createdCount++;
      } catch (error) {
        console.error('Error processing OSM element:', error);
        failedCount++;
      }
    }
  } catch (error) {
    console.error('Error fetching from OSM:', error);
    failedCount++;
  }

  return {
    success: true,
    records_processed: processedCount,
    records_created: createdCount,
    records_updated: 0,
    records_failed: failedCount,
    data: results,
  };
}

async function syncEventbrite(config: any) {
  console.log('Starting Eventbrite sync with config:', config);
  
  // Note: This would require Eventbrite API key stored in secrets
  // For now, return mock data structure
  return {
    success: false,
    error: 'Eventbrite API key required. Please configure in secrets.',
    records_processed: 0,
    records_created: 0,
    records_updated: 0,
    records_failed: 0,
    data: [],
  };
}

async function syncMeetup(config: any) {
  console.log('Starting Meetup sync with config:', config);
  
  // Note: This would require Meetup API key stored in secrets
  // For now, return mock data structure
  return {
    success: false,
    error: 'Meetup API key required. Please configure in secrets.',
    records_processed: 0,
    records_created: 0,
    records_updated: 0,
    records_failed: 0,
    data: [],
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { connectorId, provider, config } = await req.json() as ConnectorConfig;

    console.log(`Starting sync for connector ${connectorId} with provider ${provider}`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create sync job record
    const { data: job, error: jobError } = await supabase
      .from('cms_sync_jobs')
      .insert({
        connector_id: connectorId,
        job_type: 'manual_sync',
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create sync job: ${jobError.message}`);
    }

    console.log(`Created sync job: ${job.id}`);

    let syncResult;

    // Execute sync based on provider
    switch (provider) {
      case 'wikidata':
        syncResult = await syncWikidata(config);
        break;
      case 'openstreetmap':
        syncResult = await syncOpenStreetMap(config);
        break;
      case 'eventbrite':
        syncResult = await syncEventbrite(config);
        break;
      case 'meetup':
        syncResult = await syncMeetup(config);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    console.log('Sync result:', syncResult);

    // Store imported content if successful
    if (syncResult.success && syncResult.data && syncResult.data.length > 0) {
      console.log(`Inserting ${syncResult.data.length} content items`);
      
      const { error: contentError } = await supabase
        .from('cms_content')
        .insert(syncResult.data.map(item => ({
          ...item,
          created_by: null, // System import
          slug: `${provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        })));

      if (contentError) {
        console.error('Error inserting content:', contentError);
        syncResult.success = false;
        syncResult.error = `Failed to store content: ${contentError.message}`;
        syncResult.records_failed = syncResult.data.length;
        syncResult.records_created = 0;
      }
    }

    // Update sync job with results
    const { error: updateError } = await supabase
      .from('cms_sync_jobs')
      .update({
        status: syncResult.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        records_processed: syncResult.records_processed,
        records_created: syncResult.records_created,
        records_updated: syncResult.records_updated,
        records_failed: syncResult.records_failed,
        error_details: syncResult.error ? { message: syncResult.error } : null,
      })
      .eq('id', job.id);

    if (updateError) {
      console.error('Error updating sync job:', updateError);
    }

    // Update connector last sync time
    const { error: connectorError } = await supabase
      .from('cms_connectors')
      .update({
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
      })
      .eq('id', connectorId);

    if (connectorError) {
      console.error('Error updating connector:', connectorError);
    }

    return new Response(
      JSON.stringify({
        success: syncResult.success,
        jobId: job.id,
        recordsProcessed: syncResult.records_processed,
        recordsCreated: syncResult.records_created,
        recordsUpdated: syncResult.records_updated,
        recordsFailed: syncResult.records_failed,
        error: syncResult.error,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Connector sync error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
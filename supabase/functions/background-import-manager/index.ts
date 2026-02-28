import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

interface ImportJob {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_batch: number;
  total_batches: number;
  processed_items: number;
  total_items: number;
  successful_items: number;
  failed_items: number;
  duplicate_items: number;
  message: string;
  error_details?: string;
  retry_count: number;
  max_retries: number;
  data: any;
  batch_size: number;
  import_config: ImportConfig;
}

interface ImportConfig {
  duplicateStrategy: 'skip' | 'update' | 'fail' | 'create_new';
  errorStrategy: 'continue' | 'stop' | 'retry_batch';
  validation: {
    strict: boolean;
    required_fields: string[];
    custom_validations: Record<string, any>;
  };
  filters: {
    location?: string;
    date_range?: { start: string; end: string };
    keywords?: string[];
    categories?: string[];
    limit?: number;
    offset?: number;
  };
  advanced: {
    enable_geocoding: boolean;
    enable_image_processing: boolean;
    enable_ai_enhancement: boolean;
    concurrent_limit: number;
    timeout_seconds: number;
  };
}

// Complete mapping of all import types to their corresponding edge functions
const IMPORT_TYPE_MAPPING: Record<string, string> = {
  // Personality imports
  'personalities-bulk': 'bulk-create-personalities',
  'reimport-personality-images': 'reimport-personality-images',
  'import-personalities-csv': 'import-personalities-csv',
  
  // Event imports
  'events-csv': 'import-events-csv',
  'import-eventbrite-events': 'import-eventbrite-events',
  'import-ticketmaster-events': 'import-ticketmaster-events',
  'bulk-scrape-events': 'bulk-scrape-events',
  
  // Venue imports
  'venues-csv': 'import-venues-csv',
  'import-foursquare-venues': 'import-foursquare-venues',
  'import-tripadvisor-venues': 'import-tripadvisor-venues',
  'import-google-places-venues': 'import-google-places-venues',
  'import-tomtom-venues': 'import-tomtom-venues',
  
  // Restroom imports
  'import-refuge-restrooms': 'import-refuge-restrooms',
  
  // Tag and category imports
  'tags-csv': 'import-tags-csv',
  'categorize-tags': 'categorize-tags',
  'bulk-create-ai-tags': 'bulk-create-ai-tags',
  
  // Data imports
  'import-city-data': 'import-city-data',
  'import-country-data': 'import-country-data',
  'import-ilga-data': 'import-ilga-data',
  'link-locations': 'link-locations',
  
  // News and content
  'fetch-news': 'fetch-news',
  'fetch-personality-data': 'fetch-personality-data',
  'fetch-wikipedia-data': 'fetch-wikipedia-data',
  
  // Marketplace
  'import-awin-products': 'import-awin-products',
  
  // Adult content
  'import-adult-models-csv': 'import-adult-models-csv'
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient()
    const auth = await requireAdmin(req, supabase)
    if (auth instanceof Response) return auth

    const { action, type, data, batchSize, jobId, importConfig } = await req.json();

    switch (action) {
      case 'create':
        return await createJob(supabase, type, data, batchSize || 5, importConfig);
      case 'retry':
        return await retryJob(supabase, jobId);
      case 'pause':
        return await pauseJob(supabase, jobId);
      case 'resume':
        return await resumeJob(supabase, jobId);
      case 'cancel':
        return await cancelJob(supabase, jobId);
      case 'process':
        return await processJobs(supabase);
      case 'list':
        return await listJobs(supabase);
      case 'cleanup':
        return await cleanupOldJobs(supabase);
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Background import error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function createJob(supabase: any, type: string, data: any, batchSize: number, importConfig?: ImportConfig) {
  console.log(`Creating job for type: ${type}`);
  
  // Validate import type
  if (!IMPORT_TYPE_MAPPING[type]) {
    throw new Error(`Unsupported import type: ${type}. Supported types: ${Object.keys(IMPORT_TYPE_MAPPING).join(', ')}`);
  }

  // Set default import configuration if not provided
  const defaultConfig: ImportConfig = {
    duplicateStrategy: 'skip',
    errorStrategy: 'continue',
    validation: {
      strict: false,
      required_fields: [],
      custom_validations: {}
    },
    filters: {
      limit: 1000
    },
    advanced: {
      enable_geocoding: false,
      enable_image_processing: true,
      enable_ai_enhancement: false,
      concurrent_limit: 3,
      timeout_seconds: 60
    }
  };

  const config = { ...defaultConfig, ...importConfig };

  // Apply filters to data if specified
  let filteredData = data;
  if (config.filters) {
    filteredData = applyFilters(data, config.filters, type);
  }

  // Calculate total items and batches
  let totalItems = calculateTotalItems(filteredData, type);
  
  // Apply limit from filters
  if (config.filters.limit && totalItems > config.filters.limit) {
    totalItems = config.filters.limit;
    filteredData = limitData(filteredData, config.filters.limit, type);
  }
  
  const totalBatches = Math.max(1, Math.ceil(totalItems / batchSize));

  console.log(`Creating job: type=${type}, totalItems=${totalItems}, batchSize=${batchSize}, totalBatches=${totalBatches}`);

  const { data: job, error } = await supabase
    .from('import_jobs')
    .insert({
      type,
      status: 'queued',
      progress: 0,
      current_batch: 0,
      total_batches: totalBatches,
      processed_items: 0,
      total_items: totalItems,
      successful_items: 0,
      failed_items: 0,
      duplicate_items: 0,
      message: `Job created for ${type} with ${Object.keys(config.filters || {}).length} filters applied`,
      retry_count: 0,
      max_retries: 3,
      data: filteredData,
      batch_size: batchSize,
      import_config: config
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to create job:', error);
    throw error;
  }

  if (!job) {
    throw new Error('Failed to create job - no data returned');
  }

  console.log(`Job created with ID: ${job.id}`);

  // Start background processing immediately
  EdgeRuntime.waitUntil(processJobInBackground(supabase, job.id));

  return new Response(
    JSON.stringify({ 
      jobId: job.id, 
      message: `Job created for ${type}`,
      totalItems,
      totalBatches,
      batchSize,
      config: config
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function applyFilters(data: any, filters: any, type: string): any {
  console.log(`Applying filters to ${type}:`, filters);
  
  // Apply location filter for venue/event imports
  if (filters.location && ['import-foursquare-venues', 'import-tripadvisor-venues', 'import-google-places-venues', 'import-tomtom-venues', 'import-refuge-restrooms', 'import-eventbrite-events', 'import-ticketmaster-events'].includes(type)) {
    data = { ...data, location: filters.location };
  }
  
  // Apply keywords filter
  if (filters.keywords && filters.keywords.length > 0) {
    data = { ...data, keywords: filters.keywords };
  }
  
  // Apply categories filter
  if (filters.categories && filters.categories.length > 0) {
    data = { ...data, categories: filters.categories };
  }
  
  // Apply date range filter
  if (filters.date_range) {
    data = { ...data, date_range: filters.date_range };
  }
  
  return data;
}

function limitData(data: any, limit: number, type: string): any {
  if (Array.isArray(data)) {
    return data.slice(0, limit);
  } else if (data.names && Array.isArray(data.names)) {
    return { ...data, names: data.names.slice(0, limit) };
  } else if (data.seeds && Array.isArray(data.seeds)) {
    return { ...data, seeds: data.seeds.slice(0, limit) };
  } else if (data.urls && Array.isArray(data.urls)) {
    return { ...data, urls: data.urls.slice(0, limit) };
  } else if (data.items && Array.isArray(data.items)) {
    return { ...data, items: data.items.slice(0, limit) };
  }
  
  return data;
}

function calculateTotalItems(data: any, type: string): number {
  if (Array.isArray(data)) {
    return data.length;
  } else if (data.names && Array.isArray(data.names)) {
    return data.names.length;
  } else if (data.seeds && Array.isArray(data.seeds)) {
    return data.seeds.length;
  } else if (data.urls && Array.isArray(data.urls)) {
    return data.urls.length;
  } else if (data.items && Array.isArray(data.items)) {
    return data.items.length;
  } else if (data.file || data.csvData) {
    // For CSV imports, estimate based on data size or default to 1
    return data.estimatedRows || 1;
  }
  
  // For single operations (like data fetches), return 1
  return 1;
}

async function processJobInBackground(supabase: any, jobId: string) {
  try {
    console.log(`Starting background processing for job ${jobId}`);
    
    const { data: job, error } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      console.error('Job not found:', error);
      return;
    }

    // Validate import type exists
    const functionName = IMPORT_TYPE_MAPPING[job.type];
    if (!functionName) {
      await updateJobStatus(supabase, jobId, 'failed', `Unsupported import type: ${job.type}`);
      return;
    }

    await updateJobStatus(supabase, jobId, 'running', `Processing ${job.type}...`);

    const batches = createBatches(job.data, job.batch_size, job.type);
    console.log(`Created ${batches.length} batches for job ${jobId}`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // Check if job is paused or cancelled
      const { data: currentJob } = await supabase
        .from('import_jobs')
        .select('status')
        .eq('id', jobId)
        .single();

      if (currentJob?.status === 'paused') {
        await updateJobStatus(supabase, jobId, 'paused', 'Job paused by user');
        return;
      }

      if (currentJob?.status === 'cancelled') {
        await updateJobStatus(supabase, jobId, 'cancelled', 'Job cancelled by user');
        return;
      }

      const batch = batches[batchIndex];
      
      try {
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} for job ${jobId}`);
        
        await updateJob(supabase, jobId, {
          current_batch: batchIndex + 1,
          message: `Processing batch ${batchIndex + 1}/${batches.length} of ${job.type}`
        });

        await processBatch(supabase, job.type, batch, jobId, batchIndex);
        
        const processedItems = Math.min((batchIndex + 1) * job.batch_size, job.total_items);
        const progress = Math.round((processedItems / job.total_items) * 100);
        
        await updateJob(supabase, jobId, {
          processed_items: processedItems,
          progress
        });

        console.log(`Batch ${batchIndex + 1} completed. Progress: ${progress}%`);

      } catch (batchError) {
        console.error(`Batch ${batchIndex + 1} failed:`, batchError);
        await handleBatchError(supabase, jobId, batchError, batchIndex + 1);
        return; // Stop processing on batch failure
      }

      // Small delay between batches to prevent overwhelming the system
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await updateJobStatus(supabase, jobId, 'completed', `Successfully completed ${job.type} import`);
    console.log(`Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await updateJobStatus(supabase, jobId, 'failed', `Job failed: ${error.message}`);
  }
}

function createBatches(data: any, batchSize: number, type: string): any[] {
  console.log(`Creating batches for type ${type} with batch size ${batchSize}`);
  
  if (Array.isArray(data)) {
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  } else if (data.names && Array.isArray(data.names)) {
    const batches = [];
    for (let i = 0; i < data.names.length; i += batchSize) {
      batches.push({
        ...data,
        names: data.names.slice(i, i + batchSize)
      });
    }
    return batches;
  } else if (data.seeds && Array.isArray(data.seeds)) {
    const batches = [];
    for (let i = 0; i < data.seeds.length; i += batchSize) {
      batches.push({
        ...data,
        seeds: data.seeds.slice(i, i + batchSize)
      });
    }
    return batches;
  } else if (data.urls && Array.isArray(data.urls)) {
    const batches = [];
    for (let i = 0; i < data.urls.length; i += batchSize) {
      batches.push({
        ...data,
        urls: data.urls.slice(i, i + batchSize)
      });
    }
    return batches;
  } else if (data.items && Array.isArray(data.items)) {
    const batches = [];
    for (let i = 0; i < data.items.length; i += batchSize) {
      batches.push({
        ...data,
        items: data.items.slice(i, i + batchSize)
      });
    }
    return batches;
  }
  
  // For single operations, return the data as a single batch
  return [data];
}

async function processBatch(supabase: any, type: string, batchData: any, jobId: string, batchIndex: number) {
  console.log(`Processing batch ${batchIndex + 1} for type ${type}`);
  
  const functionName = IMPORT_TYPE_MAPPING[type];
  if (!functionName) {
    throw new Error(`No function mapping found for type: ${type}`);
  }

  let payload: any;

  // Prepare payload based on import type
  switch (type) {
    case 'personalities-bulk':
      payload = { names: batchData.names || batchData };
      break;
    case 'events-csv':
    case 'venues-csv':
    case 'tags-csv':
    case 'import-personalities-csv':
    case 'import-adult-models-csv':
      payload = batchData;
      break;
    case 'bulk-scrape-events':
      payload = batchData;
      break;
    case 'import-eventbrite-events':
    case 'import-ticketmaster-events':
      payload = { 
        ...batchData,
        location: batchData.location || 'San Francisco',
        keywords: batchData.keywords || ['lgbt', 'pride'],
        limit: batchData.limit || 50
      };
      break;
    case 'import-foursquare-venues':
    case 'import-tripadvisor-venues':
    case 'import-google-places-venues':
    case 'import-tomtom-venues':
      payload = {
        ...batchData,
        location: batchData.location || 'San Francisco',
        query: batchData.query || 'lgbt',
        limit: batchData.limit || 50
      };
      break;
    case 'import-refuge-restrooms':
      payload = {
        ...batchData,
        location: batchData.location || 'San Francisco',
        limit: batchData.limit || 100
      };
      break;
    case 'categorize-tags':
    case 'bulk-create-ai-tags':
      payload = batchData;
      break;
    case 'import-city-data':
    case 'import-country-data':
    case 'import-ilga-data':
    case 'link-locations':
    case 'fetch-news':
    case 'fetch-personality-data':
    case 'fetch-wikipedia-data':
    case 'reimport-personality-images':
      payload = batchData;
      break;
    case 'import-awin-products':
      payload = {
        ...batchData,
        category: batchData.category || 'travel',
        limit: batchData.limit || 100
      };
      break;
    default:
      payload = batchData;
  }

  console.log(`Invoking function ${functionName} with payload:`, JSON.stringify(payload).substring(0, 200));

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload
  });

  if (error) {
    console.error(`Function ${functionName} failed:`, error);
    throw new Error(`Function ${functionName} failed: ${error.message}`);
  }

  console.log(`Batch ${batchIndex + 1} completed successfully for ${functionName}`);
  return data;
}

async function handleBatchError(supabase: any, jobId: string, error: any, batchNumber: number) {
  console.error(`Handling batch error for job ${jobId}, batch ${batchNumber}:`, error);
  
  const { data: job } = await supabase
    .from('import_jobs')
    .select('retry_count, max_retries')
    .eq('id', jobId)
    .single();

  if (job && job.retry_count < job.max_retries) {
    const newRetryCount = job.retry_count + 1;
    await updateJob(supabase, jobId, {
      retry_count: newRetryCount,
      message: `Batch ${batchNumber} failed, attempt ${newRetryCount}/${job.max_retries}. Error: ${error.message}`,
      error_details: error.message
    });
    
    console.log(`Will retry job ${jobId} (attempt ${newRetryCount}/${job.max_retries})`);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Restart processing from the beginning
    EdgeRuntime.waitUntil(processJobInBackground(supabase, jobId));
  } else {
    await updateJobStatus(
      supabase, 
      jobId, 
      'failed', 
      `Batch ${batchNumber} failed after max retries: ${error.message}`,
      error.message
    );
  }
}

async function updateJobStatus(supabase: any, jobId: string, status: string, message: string, errorDetails?: string) {
  const updates: any = {
    status,
    message,
    updated_at: new Date().toISOString()
  };
  
  if (errorDetails) {
    updates.error_details = errorDetails;
  }
  
  const { error } = await supabase
    .from('import_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    console.error('Failed to update job status:', error);
  } else {
    console.log(`Job ${jobId} status updated to ${status}: ${message}`);
  }
}

async function updateJob(supabase: any, jobId: string, updates: any) {
  const { error } = await supabase
    .from('import_jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);

  if (error) {
    console.error('Failed to update job:', error);
  }
}

async function listJobs(supabase: any) {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return new Response(
    JSON.stringify({ jobs: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function cleanupOldJobs(supabase: any) {
  // Clean up completed/failed jobs older than 24 hours
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { error } = await supabase
    .from('import_jobs')
    .delete()
    .in('status', ['completed', 'failed', 'cancelled'])
    .lt('updated_at', cutoffDate);

  if (error) throw error;

  return new Response(
    JSON.stringify({ message: 'Old jobs cleaned up' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function retryJob(supabase: any, jobId: string) {
  console.log(`Retrying job ${jobId}`);
  
  await updateJob(supabase, jobId, {
    status: 'queued',
    message: 'Job queued for retry',
    error_details: null,
    progress: 0,
    current_batch: 0,
    processed_items: 0
  });
  
  // Start background processing again
  EdgeRuntime.waitUntil(processJobInBackground(supabase, jobId));

  return new Response(
    JSON.stringify({ message: 'Job retry initiated' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function pauseJob(supabase: any, jobId: string) {
  await updateJobStatus(supabase, jobId, 'paused', 'Job paused by user');

  return new Response(
    JSON.stringify({ message: 'Job paused' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function resumeJob(supabase: any, jobId: string) {
  await updateJobStatus(supabase, jobId, 'queued', 'Job resumed by user');
  
  // Resume background processing
  EdgeRuntime.waitUntil(processJobInBackground(supabase, jobId));

  return new Response(
    JSON.stringify({ message: 'Job resumed' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function cancelJob(supabase: any, jobId: string) {
  await updateJobStatus(supabase, jobId, 'cancelled', 'Job cancelled by user');

  return new Response(
    JSON.stringify({ message: 'Job cancelled' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function processJobs(supabase: any) {
  // This can be called by a cron job to process queued jobs
  const { data: queuedJobs } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('status', 'queued')
    .limit(5);

  if (queuedJobs && queuedJobs.length > 0) {
    console.log(`Processing ${queuedJobs.length} queued jobs`);
    
    for (const job of queuedJobs) {
      EdgeRuntime.waitUntil(processJobInBackground(supabase, job.id));
    }
  }

  return new Response(
    JSON.stringify({ 
      message: `Processing ${queuedJobs?.length || 0} queued jobs`,
      supportedTypes: Object.keys(IMPORT_TYPE_MAPPING)
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
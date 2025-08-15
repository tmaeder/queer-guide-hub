import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImportJob {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_batch: number;
  total_batches: number;
  processed_items: number;
  total_items: number;
  message: string;
  error_details?: string;
  retry_count: number;
  max_retries: number;
  data: any;
  batch_size: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, type, data, batchSize, jobId } = await req.json();

    switch (action) {
      case 'create':
        return await createJob(supabase, type, data, batchSize || 50);
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
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Background import error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function createJob(supabase: any, type: string, data: any, batchSize: number) {
  // Calculate total items and batches
  let totalItems = 0;
  if (Array.isArray(data)) {
    totalItems = data.length;
  } else if (data.names && Array.isArray(data.names)) {
    totalItems = data.names.length;
  } else if (data.seeds && Array.isArray(data.seeds)) {
    totalItems = data.seeds.length;
  } else {
    totalItems = 1;
  }

  const totalBatches = Math.ceil(totalItems / batchSize);

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
      message: 'Job created and queued for processing',
      retry_count: 0,
      max_retries: 3,
      data,
      batch_size: batchSize
    })
    .select()
    .single();

  if (error) throw error;

  // Start background processing
  EdgeRuntime.waitUntil(processJobInBackground(supabase, job.id));

  return new Response(
    JSON.stringify({ jobId: job.id, message: 'Job created successfully' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
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

    await updateJobStatus(supabase, jobId, 'running', 'Processing started');

    const batches = createBatches(job.data, job.batch_size);
    
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
        await updateJob(supabase, jobId, {
          current_batch: batchIndex + 1,
          message: `Processing batch ${batchIndex + 1}/${batches.length}`
        });

        await processBatch(supabase, job.type, batch, jobId, batchIndex);
        
        const processedItems = (batchIndex + 1) * job.batch_size;
        const actualProcessedItems = Math.min(processedItems, job.total_items);
        const progress = Math.round((actualProcessedItems / job.total_items) * 100);
        
        await updateJob(supabase, jobId, {
          processed_items: actualProcessedItems,
          progress
        });

      } catch (batchError) {
        console.error(`Batch ${batchIndex + 1} failed:`, batchError);
        await handleBatchError(supabase, jobId, batchError, batchIndex);
      }

      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await updateJobStatus(supabase, jobId, 'completed', 'All batches processed successfully');
    
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await updateJobStatus(supabase, jobId, 'failed', `Job failed: ${error.message}`);
  }
}

function createBatches(data: any, batchSize: number): any[] {
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
  }
  
  return [data];
}

async function processBatch(supabase: any, type: string, batchData: any, jobId: string, batchIndex: number) {
  console.log(`Processing batch ${batchIndex + 1} for type ${type}`);
  
  let functionName: string;
  let payload: any;

  switch (type) {
    case 'personalities-bulk':
      functionName = 'bulk-create-personalities';
      payload = { names: batchData.names || batchData };
      break;
    case 'events-csv':
      functionName = 'import-events-csv';
      payload = batchData;
      break;
    case 'venues-csv':
      functionName = 'import-venues-csv';
      payload = batchData;
      break;
    case 'tags-csv':
      functionName = 'import-tags-csv';
      payload = batchData;
      break;
    case 'bulk-scrape-events':
      functionName = 'bulk-scrape-events';
      payload = batchData;
      break;
    default:
      throw new Error(`Unknown import type: ${type}`);
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload
  });

  if (error) {
    console.error(`Function ${functionName} failed:`, error);
    throw error;
  }

  console.log(`Batch ${batchIndex + 1} completed successfully:`, data);
  return data;
}

async function handleBatchError(supabase: any, jobId: string, error: any, batchIndex: number) {
  const { data: job } = await supabase
    .from('import_jobs')
    .select('retry_count, max_retries')
    .eq('id', jobId)
    .single();

  if (job && job.retry_count < job.max_retries) {
    await updateJob(supabase, jobId, {
      retry_count: job.retry_count + 1,
      message: `Batch ${batchIndex + 1} failed, will retry. Error: ${error.message}`,
      error_details: error.message
    });
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // This would trigger a retry of the failed batch
    // In a more complex implementation, you'd track which batches failed
  } else {
    await updateJobStatus(
      supabase, 
      jobId, 
      'failed', 
      `Batch ${batchIndex + 1} failed after max retries: ${error.message}`,
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

async function retryJob(supabase: any, jobId: string) {
  await updateJobStatus(supabase, jobId, 'queued', 'Job queued for retry');
  
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
  // This could be called by a cron job to process queued jobs
  const { data: queuedJobs } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('status', 'queued')
    .limit(5);

  if (queuedJobs && queuedJobs.length > 0) {
    for (const job of queuedJobs) {
      EdgeRuntime.waitUntil(processJobInBackground(supabase, job.id));
    }
  }

  return new Response(
    JSON.stringify({ message: `Processing ${queuedJobs?.length || 0} queued jobs` }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessingConfig {
  progressive: {
    av1: boolean;
    vp9: boolean;
    h264: boolean;
  };
  adaptive: {
    hls: boolean;
    dash: boolean;
  };
  resolutions: string[];
  generateCaptions: boolean;
  generateThumbnails: boolean;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  progressive: {
    av1: true,
    vp9: true,
    h264: true
  },
  adaptive: {
    hls: true,
    dash: false
  },
  resolutions: ['2160p', '1440p', '1080p', '720p', '540p', '360p'],
  generateCaptions: true,
  generateThumbnails: true
}

const BITRATE_LADDER = {
  '2160p': { width: 3840, height: 2160, bitrate: 14000 },
  '1440p': { width: 2560, height: 1440, bitrate: 7000 },
  '1080p': { width: 1920, height: 1080, bitrate: 4500 },
  '720p': { width: 1280, height: 720, bitrate: 2500 },
  '540p': { width: 960, height: 540, bitrate: 1500 },
  '360p': { width: 640, height: 360, bitrate: 900 }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { action, videoId, jobId, config } = await req.json()

    if (action === 'start') {
      // Create processing job
      console.log(`🎬 Starting video processing for ${videoId}`)
      
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single()

      if (videoError || !video) {
        throw new Error('Video not found')
      }

      // Create processing job
      const processingConfig = { ...DEFAULT_CONFIG, ...config }
      const jobId = crypto.randomUUID()
      
      const { error: jobError } = await supabase
        .from('video_processing_jobs')
        .insert([{
          id: jobId,
          video_id: videoId,
          status: 'pending',
          processing_config: processingConfig,
          total_renditions: calculateTotalRenditions(processingConfig)
        }])

      if (jobError) throw jobError

      // Update video with job ID
      await supabase
        .from('videos')
        .update({ 
          processing_job_id: jobId,
          status: 'processing'
        })
        .eq('id', videoId)

      console.log(`📊 Created processing job ${jobId} for video ${videoId}`)

      // Start background processing
      const backgroundTask = async () => {
        console.log(`🔄 Starting background video processing for job ${jobId}`)
        await processVideoInBackground(supabase, jobId, video, processingConfig)
      }

      // Use EdgeRuntime.waitUntil to continue processing after response
      EdgeRuntime.waitUntil(backgroundTask())

      return new Response(
        JSON.stringify({ 
          success: true, 
          jobId,
          message: `Started video processing job`,
          estimatedTime: `${Math.ceil(calculateTotalRenditions(processingConfig) * 2)} minutes`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'status' && jobId) {
      // Get job status
      const { data: job } = await supabase
        .from('video_processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      return new Response(
        JSON.stringify({ success: true, job }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'list') {
      // List processing jobs
      const { data: jobs } = await supabase
        .from('video_processing_jobs')
        .select(`
          *,
          videos!inner(id, title, original_filename)
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      return new Response(
        JSON.stringify({ success: true, jobs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Video processing error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function calculateTotalRenditions(config: ProcessingConfig): number {
  let total = 0
  
  // Progressive renditions
  const progressiveFormats = Object.values(config.progressive).filter(Boolean).length
  total += progressiveFormats
  
  // Adaptive renditions
  if (config.adaptive.hls || config.adaptive.dash) {
    // Each resolution gets H.264 for sure, plus modern codecs if enabled
    const codecCount = 1 + (config.progressive.av1 ? 1 : 0) + (config.progressive.vp9 ? 1 : 0)
    total += config.resolutions.length * codecCount * (config.adaptive.hls ? 1 : 0)
    total += config.resolutions.length * codecCount * (config.adaptive.dash ? 1 : 0)
  }
  
  return total
}

async function processVideoInBackground(
  supabase: any, 
  jobId: string, 
  video: any, 
  config: ProcessingConfig
) {
  try {
    console.log(`🎬 Processing video: ${video.original_filename}`)
    
    // Update job status to processing
    await supabase
      .from('video_processing_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        current_stage: 'analyzing'
      })
      .eq('id', jobId)

    let completedRenditions = 0
    const totalRenditions = calculateTotalRenditions(config)

    // Simulate video analysis
    console.log(`📊 Analyzing video properties...`)
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Update progress
    await updateJobProgress(supabase, jobId, 5, 'encoding_progressive')

    // Generate progressive renditions
    if (config.progressive.h264) {
      await generateProgressiveRendition(supabase, video.id, 'h264', 'mp4')
      completedRenditions++
      await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 80, 'encoding_progressive', completedRenditions)
    }

    if (config.progressive.vp9) {
      await generateProgressiveRendition(supabase, video.id, 'vp9', 'webm')
      completedRenditions++
      await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 80, 'encoding_progressive', completedRenditions)
    }

    if (config.progressive.av1) {
      await generateProgressiveRendition(supabase, video.id, 'av1', 'webm')
      completedRenditions++
      await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 80, 'encoding_progressive', completedRenditions)
    }

    // Generate adaptive streaming renditions
    if (config.adaptive.hls) {
      await updateJobProgress(supabase, jobId, 85, 'encoding_adaptive')
      
      for (const resolution of config.resolutions) {
        await generateHLSRendition(supabase, video.id, resolution, 'h264')
        completedRenditions++
        await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 95, 'encoding_adaptive', completedRenditions)
      }
    }

    // Generate thumbnails and poster
    if (config.generateThumbnails) {
      await updateJobProgress(supabase, jobId, 96, 'generating_thumbnails')
      await generateVideoThumbnails(supabase, video.id)
    }

    // Generate captions placeholder
    if (config.generateCaptions) {
      await updateJobProgress(supabase, jobId, 98, 'generating_captions')
      await generateCaptionsPlaceholder(supabase, video.id)
    }

    // Final update
    await supabase
      .from('video_processing_jobs')
      .update({
        status: 'completed',
        progress_percent: 100,
        completed_renditions: completedRenditions,
        completed_at: new Date().toISOString(),
        current_stage: 'completed'
      })
      .eq('id', jobId)

    // Update video status
    await supabase
      .from('videos')
      .update({ status: 'completed' })
      .eq('id', video.id)

    console.log(`🎉 Video processing completed for job ${jobId}`)

  } catch (error) {
    console.error(`💥 Video processing failed for job ${jobId}:`, error)
    
    // Mark job as failed
    await supabase
      .from('video_processing_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

    // Update video status
    await supabase
      .from('videos')
      .update({ status: 'failed' })
      .eq('processing_job_id', jobId)
  }
}

async function updateJobProgress(
  supabase: any, 
  jobId: string, 
  percent: number, 
  stage: string, 
  completedRenditions?: number
) {
  const updates: any = {
    progress_percent: Math.round(percent),
    current_stage: stage,
    updated_at: new Date().toISOString()
  }
  
  if (completedRenditions !== undefined) {
    updates.completed_renditions = completedRenditions
  }

  await supabase
    .from('video_processing_jobs')
    .update(updates)
    .eq('id', jobId)
}

async function generateProgressiveRendition(
  supabase: any, 
  videoId: string, 
  codec: string, 
  container: string
) {
  console.log(`🎥 Generating ${codec} progressive rendition...`)
  
  // Simulate encoding time
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // In real implementation, this would:
  // 1. Download source video from storage
  // 2. Run ffmpeg with appropriate codec settings
  // 3. Upload result back to storage
  // 4. Record rendition in database
  
  const mockSize = Math.random() * 50000000 + 10000000 // 10-60MB
  const filePath = `${videoId}/progressive/video-${codec}.${container}`
  
  await supabase
    .from('video_renditions')
    .insert([{
      video_id: videoId,
      format: 'progressive',
      codec,
      container,
      resolution: 'source',
      file_size: Math.round(mockSize),
      file_path: filePath
    }])
  
  console.log(`✅ Generated ${codec} progressive rendition`)
}

async function generateHLSRendition(
  supabase: any, 
  videoId: string, 
  resolution: string, 
  codec: string
) {
  console.log(`📺 Generating HLS ${resolution} ${codec} rendition...`)
  
  // Simulate encoding time
  await new Promise(resolve => setTimeout(resolve, 4000))
  
  const { width, height, bitrate } = BITRATE_LADDER[resolution] || BITRATE_LADDER['720p']
  const mockSize = Math.random() * 30000000 + 5000000 // 5-35MB
  const mockSegments = Math.floor(Math.random() * 100) + 20 // 20-120 segments
  const filePath = `${videoId}/hls/${resolution}/playlist.m3u8`
  
  await supabase
    .from('video_renditions')
    .insert([{
      video_id: videoId,
      format: 'hls',
      codec,
      container: 'm3u8',
      resolution,
      width,
      height,
      bitrate_kbps: bitrate,
      file_size: Math.round(mockSize),
      file_path: filePath,
      segment_count: mockSegments
    }])
  
  console.log(`✅ Generated HLS ${resolution} ${codec} rendition`)
}

async function generateVideoThumbnails(supabase: any, videoId: string) {
  console.log(`🖼️ Generating video thumbnails...`)
  
  // Simulate thumbnail generation
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // In real implementation:
  // 1. Extract frames at intervals
  // 2. Generate poster image (AVIF + JPEG fallback)
  // 3. Generate preview sprites for scrubbing
  // 4. Upload to storage and update video record
  
  const posterPath = `${videoId}/poster.avif`
  
  await supabase
    .from('videos')
    .update({ poster_image_path: posterPath })
    .eq('id', videoId)
    
  console.log(`✅ Generated video thumbnails`)
}

async function generateCaptionsPlaceholder(supabase: any, videoId: string) {
  console.log(`📝 Generating captions placeholder...`)
  
  // Simulate caption processing
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // In real implementation:
  // 1. Use speech recognition API
  // 2. Generate VTT files
  // 3. Upload to storage
  
  const captionsPath = `${videoId}/captions.vtt`
  
  await supabase
    .from('videos')
    .update({ captions_path: captionsPath })
    .eq('id', videoId)
    
  console.log(`✅ Generated captions placeholder`)
}
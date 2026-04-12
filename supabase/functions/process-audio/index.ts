import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

interface ProcessingConfig {
  progressive: {
    opus: boolean;
    aac: boolean;
    mp3: boolean;
  };
  adaptive: {
    hls: boolean;
    dash: boolean;
  };
  quality: 'podcast' | 'music' | 'high';
  generateTranscript: boolean;
  normalizeLoudness: boolean;
}

const DEFAULT_CONFIG: ProcessingConfig = {
  progressive: {
    opus: true,
    aac: true,
    mp3: true
  },
  adaptive: {
    hls: false,
    dash: false
  },
  quality: 'music',
  generateTranscript: false,
  normalizeLoudness: true
}

const BITRATE_SETTINGS = {
  podcast: { opus: 64, aac: 96, mp3: 112 },
  music: { opus: 128, aac: 160, mp3: 192 },
  high: { opus: 192, aac: 256, mp3: 320 }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const { action, audioId, jobId, config } = await req.json()

    if (action === 'start') {
      console.log(`🎵 Starting audio processing for ${audioId}`)

      const { data: audio, error: audioError } = await supabase
        .from('audio_files')
        .select('*')
        .eq('id', audioId)
        .single()

      if (audioError || !audio) {
        throw new Error('Audio file not found')
      }

      const processingConfig = { ...DEFAULT_CONFIG, ...config }
      const jobId = crypto.randomUUID()

      const { error: jobError } = await supabase
        .from('audio_processing_jobs')
        .insert([{
          id: jobId,
          audio_id: audioId,
          status: 'pending',
          processing_config: processingConfig,
          total_renditions: calculateTotalRenditions(processingConfig)
        }])

      if (jobError) throw jobError

      await supabase
        .from('audio_files')
        .update({
          processing_job_id: jobId,
          status: 'processing'
        })
        .eq('id', audioId)

      console.log(`📊 Created processing job ${jobId} for audio ${audioId}`)

      // Start background processing
      const backgroundTask = async () => {
        await processAudioInBackground(supabase, jobId, audio, processingConfig)
      }

      EdgeRuntime.waitUntil(backgroundTask())

      return new Response(
        JSON.stringify({
          success: true,
          jobId,
          message: 'Started audio processing job',
          estimatedTime: `${Math.ceil(calculateTotalRenditions(processingConfig) * 1)} minutes`
        }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'status' && jobId) {
      const { data: job } = await supabase
        .from('audio_processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      return new Response(
        JSON.stringify({ success: true, job }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'list') {
      const { data: jobs } = await supabase
        .from('audio_processing_jobs')
        .select(`
          *,
          audio_files!inner(id, title, original_filename)
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      return new Response(
        JSON.stringify({ success: true, jobs }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Audio processing error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
      }
    )
  }
})

function calculateTotalRenditions(config: ProcessingConfig): number {
  let total = 0

  // Progressive renditions
  if (config.progressive.opus) total++
  if (config.progressive.aac) total++
  if (config.progressive.mp3) total++

  // Adaptive not implemented for audio yet
  return total
}

async function processAudioInBackground(
  supabase: SupabaseClient,
  jobId: string,
  audio: unknown,
  config: ProcessingConfig
) {
  try {
    console.log(`🎵 Processing audio: ${audio.original_filename}`)

    await supabase
      .from('audio_processing_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        current_stage: 'analyzing'
      })
      .eq('id', jobId)

    let completedRenditions = 0
    const totalRenditions = calculateTotalRenditions(config)
    const bitrates = BITRATE_SETTINGS[config.quality]

    // Simulate audio analysis
    console.log(`📊 Analyzing audio properties...`)
    await new Promise(resolve => setTimeout(resolve, 1000))

    await updateJobProgress(supabase, jobId, 10, 'encoding_progressive')

    // Generate progressive renditions
    if (config.progressive.opus) {
      await generateProgressiveRendition(supabase, audio.id, 'opus', 'webm', bitrates.opus)
      completedRenditions++
      await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 80, 'encoding_progressive', completedRenditions)
    }

    if (config.progressive.aac) {
      await generateProgressiveRendition(supabase, audio.id, 'aac', 'm4a', bitrates.aac)
      completedRenditions++
      await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 80, 'encoding_progressive', completedRenditions)
    }

    if (config.progressive.mp3) {
      await generateProgressiveRendition(supabase, audio.id, 'mp3', 'mp3', bitrates.mp3)
      completedRenditions++
      await updateJobProgress(supabase, jobId, (completedRenditions / totalRenditions) * 80, 'encoding_progressive', completedRenditions)
    }

    // Generate transcript if requested
    if (config.generateTranscript) {
      await updateJobProgress(supabase, jobId, 95, 'generating_transcript')
      await generateTranscript(supabase, audio.id)
    }

    // Extract metadata and create poster image
    await updateJobProgress(supabase, jobId, 98, 'extracting_metadata')
    await extractAudioMetadata(supabase, audio.id)

    // Final update
    await supabase
      .from('audio_processing_jobs')
      .update({
        status: 'completed',
        progress_percent: 100,
        completed_renditions: completedRenditions,
        completed_at: new Date().toISOString(),
        current_stage: 'completed'
      })
      .eq('id', jobId)

    await supabase
      .from('audio_files')
      .update({ status: 'completed' })
      .eq('id', audio.id)

    console.log(`🎉 Audio processing completed for job ${jobId}`)

  } catch (error) {
    console.error(`💥 Audio processing failed for job ${jobId}:`, error)

    await supabase
      .from('audio_processing_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

    await supabase
      .from('audio_files')
      .update({ status: 'failed' })
      .eq('processing_job_id', jobId)
  }
}

async function updateJobProgress(
  supabase: unknown,
  jobId: string,
  percent: number,
  stage: string,
  completedRenditions?: number
) {
  const updates: unknown = {
    progress_percent: Math.round(percent),
    current_stage: stage,
    updated_at: new Date().toISOString()
  }

  if (completedRenditions !== undefined) {
    updates.completed_renditions = completedRenditions
  }

  await supabase
    .from('audio_processing_jobs')
    .update(updates)
    .eq('id', jobId)
}

async function generateProgressiveRendition(
  supabase: unknown,
  audioId: string,
  codec: string,
  container: string,
  bitrate: number
) {
  console.log(`🎧 Generating ${codec} progressive rendition at ${bitrate}kbps...`)

  // Simulate encoding time
  await new Promise(resolve => setTimeout(resolve, 2000))

  // In real implementation, this would:
  // 1. Download source audio from storage
  // 2. Run ffmpeg with appropriate codec settings
  // 3. Upload result back to storage
  // 4. Record rendition in database

  const mockSize = Math.random() * 10000000 + 2000000 // 2-12MB
  const filePath = `${audioId}/progressive/audio-${codec}.${container}`

  await supabase
    .from('audio_renditions')
    .insert([{
      audio_id: audioId,
      format: 'progressive',
      codec,
      container,
      bitrate_kbps: bitrate,
      file_size: Math.round(mockSize),
      file_path: filePath
    }])

  console.log(`✅ Generated ${codec} progressive rendition`)
}

async function generateTranscript(supabase: unknown, audioId: string) {
  console.log(`📝 Generating transcript...`)

  // Simulate transcript generation
  await new Promise(resolve => setTimeout(resolve, 1000))

  // In real implementation:
  // 1. Use speech recognition API (Whisper, Google Speech-to-Text, etc.)
  // 2. Generate VTT or SRT files
  // 3. Upload to storage

  const transcriptPath = `${audioId}/transcript.vtt`

  await supabase
    .from('audio_files')
    .update({ transcript_path: transcriptPath })
    .eq('id', audioId)

  console.log(`✅ Generated transcript`)
}

async function extractAudioMetadata(supabase: unknown, audioId: string) {
  console.log(`🎶 Extracting audio metadata...`)

  // Simulate metadata extraction
  await new Promise(resolve => setTimeout(resolve, 500))

  // In real implementation:
  // 1. Extract metadata (title, artist, album, duration)
  // 2. Generate waveform visualization
  // 3. Create album art or waveform poster

  const mockDuration = Math.floor(Math.random() * 300) + 60 // 1-6 minutes
  const posterPath = `${audioId}/poster.webp`

  await supabase
    .from('audio_files')
    .update({
      duration_seconds: mockDuration,
      poster_image_path: posterPath
    })
    .eq('id', audioId)

  console.log(`✅ Extracted audio metadata`)
}

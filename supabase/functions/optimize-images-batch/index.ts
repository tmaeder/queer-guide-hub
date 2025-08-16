import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OptimizationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalImages: number;
  processedImages: number;
  successfulImages: number;
  failedImages: number;
  createdAt: string;
  updatedAt: string;
  results?: any[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { action, jobId, batchSize = 10 } = await req.json()

    if (action === 'start') {
      // Get all images from storage
      console.log('🚀 Starting batch image optimization...')
      
      const { data: buckets } = await supabase.storage.listBuckets()
      const allImages: any[] = []
      
      for (const bucket of buckets || []) {
        const { data: files } = await supabase.storage
          .from(bucket.name)
          .list('', { limit: 1000 })

        const imageFiles = files?.filter(file => {
          const ext = file.name.toLowerCase()
          return ext.endsWith('.jpg') || ext.endsWith('.jpeg') || 
                 ext.endsWith('.png') || ext.endsWith('.webp') || 
                 ext.endsWith('.avif') || ext.endsWith('.gif')
        }) || []

        allImages.push(...imageFiles.map(file => ({
          ...file,
          bucket: bucket.name,
          path: `${bucket.name}/${file.name}`
        })))
      }

      // Create optimization job record
      const jobId = crypto.randomUUID()
      const job: OptimizationJob = {
        id: jobId,
        status: 'pending',
        totalImages: allImages.length,
        processedImages: 0,
        successfulImages: 0,
        failedImages: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Store job in database
      await supabase.from('image_optimization_jobs').insert([job])

      console.log(`📊 Created optimization job ${jobId} for ${allImages.length} images`)

      // Start background processing
      const backgroundTask = async () => {
        console.log(`🔄 Starting background optimization for job ${jobId}`)
        await processImagesInBatches(supabase, jobId, allImages, batchSize)
      }

      // Use EdgeRuntime.waitUntil to continue processing after response
      EdgeRuntime.waitUntil(backgroundTask())

      return new Response(
        JSON.stringify({ 
          success: true, 
          jobId,
          message: `Started optimization job for ${allImages.length} images`,
          totalImages: allImages.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'status' && jobId) {
      // Get job status
      const { data: job } = await supabase
        .from('image_optimization_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      return new Response(
        JSON.stringify({ success: true, job }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'list') {
      // List all optimization jobs
      const { data: jobs } = await supabase
        .from('image_optimization_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      return new Response(
        JSON.stringify({ success: true, jobs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Optimization error:', error)
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

async function processImagesInBatches(
  supabase: any, 
  jobId: string, 
  images: any[], 
  batchSize: number
) {
  try {
    console.log(`📦 Processing ${images.length} images in batches of ${batchSize}`)
    
    // Update job status to processing
    await supabase
      .from('image_optimization_jobs')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)

    let processedCount = 0
    let successCount = 0
    let failCount = 0
    const results: any[] = []

    // Process in batches
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize)
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(images.length / batchSize)}`)

      // Process each image in the batch
      for (const image of batch) {
        try {
          const result = await optimizeImage(supabase, image)
          results.push(result)
          successCount++
          console.log(`✅ Optimized: ${image.name}`)
        } catch (error) {
          console.error(`❌ Failed to optimize ${image.name}:`, error)
          results.push({
            fileName: image.name,
            bucket: image.bucket,
            status: 'failed',
            error: error.message
          })
          failCount++
        }

        processedCount++

        // Update progress every 5 images
        if (processedCount % 5 === 0) {
          await supabase
            .from('image_optimization_jobs')
            .update({
              processed_images: processedCount,
              successful_images: successCount,
              failed_images: failCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', jobId)
        }
      }

      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Final update
    await supabase
      .from('image_optimization_jobs')
      .update({
        status: 'completed',
        processed_images: processedCount,
        successful_images: successCount,
        failed_images: failCount,
        results: results,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)

    console.log(`🎉 Job ${jobId} completed: ${successCount} successful, ${failCount} failed`)

  } catch (error) {
    console.error(`💥 Job ${jobId} failed:`, error)
    
    // Mark job as failed
    await supabase
      .from('image_optimization_jobs')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

async function optimizeImage(supabase: any, image: any) {
  // Simulate image optimization process
  // In a real implementation, this would:
  // 1. Download the original image from storage
  // 2. Generate AVIF, WebP, and JPEG versions
  // 3. Create multiple sizes (320, 640, 768, 1024, 1280, 1440, 1920)
  // 4. Upload optimized versions back to storage
  // 5. Return optimization results

  console.log(`🖼️  Processing image: ${image.name}`)
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Mock optimization results
  const originalSize = image.metadata?.size || 100000
  const optimizedSizes = {
    avif: Math.round(originalSize * 0.3),
    webp: Math.round(originalSize * 0.5),
    jpeg: Math.round(originalSize * 0.7)
  }
  
  return {
    fileName: image.name,
    bucket: image.bucket,
    status: 'completed',
    originalSize,
    optimizedSizes,
    generatedFiles: 21, // 7 sizes × 3 formats
    savings: Math.round(((originalSize - optimizedSizes.avif) / originalSize) * 100)
  }
}
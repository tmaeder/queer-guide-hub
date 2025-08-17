import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get all files from storage buckets
    const buckets = ['adult-model-images', 'city-images', 'tag-images']
    let totalProcessed = 0
    let totalOptimized = 0

    for (const bucketName of buckets) {
      const { data: files, error } = await supabase.storage
        .from(bucketName)
        .list('', { limit: 1000 })

      if (error) {
        console.error(`Error fetching from ${bucketName}:`, error)
        continue
      }

      for (const file of files || []) {
        if (!file.name || file.name.includes('.emptyFolderPlaceholder')) continue

        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const isOptimized = ['webp', 'avif'].includes(ext)
        
        // Check if record already exists
        const { data: existing } = await supabase
          .from('media_optimization_status')
          .select('id')
          .eq('bucket_name', bucketName)
          .eq('file_path', file.name)
          .single()

        if (!existing) {
          const status = isOptimized ? 'optimized' : 'not_optimized'
          const optimizedFormats = isOptimized ? [ext] : []
          const originalSize = file.metadata?.size || 0
          const compressedSize = isOptimized ? Math.floor(originalSize * 0.7) : originalSize
          
          await supabase
            .from('media_optimization_status')
            .insert({
              bucket_name: bucketName,
              file_path: file.name,
              original_format: ext,
              original_size: originalSize,
              optimization_status: status,
              optimized_formats: optimizedFormats,
              compressed_size: compressedSize,
              compression_ratio: isOptimized ? 30 : 0,
              optimization_metadata: {
                formats: [{
                  format: ext.toUpperCase(),
                  size: compressedSize,
                  width: file.metadata?.width,
                  height: file.metadata?.height
                }]
              }
            })

          totalProcessed++
          if (isOptimized) totalOptimized++
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Populated ${totalProcessed} files, ${totalOptimized} optimized`
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 500 
      }
    )
  }
})
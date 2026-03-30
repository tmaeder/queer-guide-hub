import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    // Get request parameters
    const url = new URL(req.url)
    const batchSize = parseInt(url.searchParams.get('batchSize') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    console.log(`Processing batch: offset=${offset}, batchSize=${batchSize}`)

    // Get all files from storage buckets
    const buckets = ['adult-model-images', 'city-images', 'tag-images']
    let totalProcessed = 0
    let totalOptimized = 0

    for (const bucketName of buckets) {
      const { data: files, error } = await supabase.storage
        .from(bucketName)
        .list('', { limit: 200, offset: offset })

      if (error) {
        console.error(`Error fetching from ${bucketName}:`, error)
        continue
      }

      const batch = files?.slice(0, batchSize) || []
      console.log(`Processing ${batch.length} files from ${bucketName}`)

      // Batch insert to reduce database calls
      const insertBatch = []

      for (const file of batch) {
        if (!file.name || file.name.includes('.emptyFolderPlaceholder')) continue

        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const isOptimized = ['webp', 'avif'].includes(ext)

        // Check if record already exists (batch check)
        const { data: existing } = await supabase
          .from('media_optimization_status')
          .select('id')
          .eq('bucket_name', bucketName)
          .eq('file_path', file.name)
          .maybeSingle()

        if (!existing) {
          const status = isOptimized ? 'optimized' : 'not_optimized'
          const optimizedFormats = isOptimized ? [ext] : []
          const originalSize = file.metadata?.size || 0
          const compressedSize = isOptimized ? Math.floor(originalSize * 0.7) : originalSize

          insertBatch.push({
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

      // Batch insert
      if (insertBatch.length > 0) {
        const { error: insertError } = await supabase
          .from('media_optimization_status')
          .insert(insertBatch)

        if (insertError) {
          console.error('Batch insert error:', insertError)
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
          ...getCorsHeaders(req),
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json'
        },
        status: 500
      }
    )
  }
})

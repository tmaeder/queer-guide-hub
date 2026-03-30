import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

interface ImageInfo {
  fileName: string;
  baseName: string;
  size: number;
  relativePath: string;
  bucket?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    console.log('🔍 Scanning for stored images...')

    const foundImages: ImageInfo[] = []

    // Get list of storage buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()

    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError)
      throw bucketsError
    }

    console.log(`📁 Found ${buckets?.length || 0} storage buckets`)

    // Scan each bucket for images
    for (const bucket of buckets || []) {
      console.log(`📂 Scanning bucket: ${bucket.name}`)

      try {
        const { data: files, error: filesError } = await supabase.storage
          .from(bucket.name)
          .list('', {
            limit: 1000,
            sortBy: { column: 'name', order: 'asc' }
          })

        if (filesError) {
          console.warn(`⚠️  Error listing files in bucket ${bucket.name}:`, filesError)
          continue
        }

        // Filter for image files
        const imageFiles = files?.filter(file => {
          const ext = file.name.toLowerCase()
          return ext.endsWith('.jpg') ||
                 ext.endsWith('.jpeg') ||
                 ext.endsWith('.png') ||
                 ext.endsWith('.webp') ||
                 ext.endsWith('.avif') ||
                 ext.endsWith('.gif') ||
                 ext.endsWith('.svg')
        }) || []

        console.log(`🖼️  Found ${imageFiles.length} images in ${bucket.name}`)

        for (const file of imageFiles) {
          const baseName = file.name.replace(/\.[^/.]+$/, '') // Remove extension

          foundImages.push({
            fileName: file.name,
            baseName,
            size: file.metadata?.size || 0,
            relativePath: `storage/${bucket.name}/${file.name}`,
            bucket: bucket.name
          })
        }
      } catch (error) {
        console.warn(`⚠️  Error scanning bucket ${bucket.name}:`, error)
      }
    }

    console.log(`✅ Total images found: ${foundImages.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        images: foundImages,
        scannedBuckets: buckets?.map(b => b.name) || [],
        totalFound: foundImages.length
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in scan-project-images:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

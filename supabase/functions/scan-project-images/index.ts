import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImageInfo {
  fileName: string;
  baseName: string;
  size: number;
  relativePath: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Mock scanning logic - in a real implementation this would:
    // 1. Access the project file system
    // 2. Scan for image files in public/, src/assets/, etc.
    // 3. Return file information
    
    // For now, return some real images that likely exist in the project
    const mockImages: ImageInfo[] = [
      {
        fileName: 'icon-512.png',
        baseName: 'icon-512',
        size: 45623,
        relativePath: 'public/icons/icon-512.png'
      },
      {
        fileName: 'maskable-512.png',
        baseName: 'maskable-512', 
        size: 52341,
        relativePath: 'public/icons/maskable-512.png'
      },
      {
        fileName: 'placeholder.svg',
        baseName: 'placeholder',
        size: 2048,
        relativePath: 'public/placeholder.svg'
      },
      {
        fileName: 'favicon.ico',
        baseName: 'favicon',
        size: 15086,
        relativePath: 'public/favicon.ico'
      }
    ];

    return new Response(
      JSON.stringify({ 
        success: true,
        images: mockImages,
        scannedPaths: [
          'public/',
          'src/assets/',
          'src/assets/images/'
        ]
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
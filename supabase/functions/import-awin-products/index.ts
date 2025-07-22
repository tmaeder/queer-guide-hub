import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { decompress } from 'https://deno.land/x/compress@v0.4.5/gzip/gzip.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AwinCsvRow {
  aw_deep_link?: string
  product_name?: string
  aw_product_id?: string
  merchant_product_id?: string
  merchant_image_url?: string
  description?: string
  merchant_category?: string
  search_price?: string
  merchant_name?: string
  merchant_id?: string
  category_name?: string
  category_id?: string
  aw_image_url?: string
  currency?: string
  store_price?: string
  delivery_cost?: string
  merchant_deep_link?: string
  language?: string
  last_updated?: string
  display_price?: string
  data_feed_id?: string
  brand_name?: string
  brand_id?: string
  colour?: string
  product_short_description?: string
  specifications?: string
  condition?: string
  product_model?: string
  model_number?: string
  dimensions?: string
  keywords?: string
  promotional_text?: string
  product_type?: string
  rrp_price?: string
  saving?: string
  savings_percent?: string
  base_price?: string
  base_price_amount?: string
  base_price_text?: string
  product_price_old?: string
  merchant_thumb_url?: string
  large_image?: string
  alternate_image?: string
  aw_thumb_url?: string
  alternate_image_two?: string
  alternate_image_three?: string
  alternate_image_four?: string
  commission_group?: string
  merchant_product_category_path?: string
  merchant_product_second_category?: string
  merchant_product_third_category?: string
}

function parseCSV(csvContent: string): AwinCsvRow[] {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows: AwinCsvRow[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
    const row: AwinCsvRow = {}
    
    headers.forEach((header, index) => {
      if (values[index]) {
        row[header as keyof AwinCsvRow] = values[index]
      }
    })
    
    rows.push(row)
  }
  
  return rows
}

function mapAwinRowToMarketplace(row: AwinCsvRow) {
  // Determine category mapping
  let mappedCategory = 'other'
  let mappedSubcategory = row.merchant_product_second_category || null

  const categoryName = (row.category_name || row.merchant_category || '').toLowerCase()
  if (categoryName.includes('clothing') || categoryName.includes('fashion') || categoryName.includes('apparel')) {
    mappedCategory = 'clothing'
  } else if (categoryName.includes('book')) {
    mappedCategory = 'books'
  } else if (categoryName.includes('health') || categoryName.includes('beauty') || categoryName.includes('cosmetic')) {
    mappedCategory = 'health'
  } else if (categoryName.includes('tech') || categoryName.includes('electronic') || categoryName.includes('computer')) {
    mappedCategory = 'technology'
  } else if (categoryName.includes('art') || categoryName.includes('craft') || categoryName.includes('creative')) {
    mappedCategory = 'art'
  } else if (categoryName.includes('service')) {
    mappedCategory = 'services'
  } else if (categoryName.includes('food') || categoryName.includes('drink') || categoryName.includes('beverage')) {
    mappedCategory = 'food_beverage'
  } else if (categoryName.includes('home') || categoryName.includes('garden') || categoryName.includes('furniture')) {
    mappedCategory = 'home_garden'
  } else if (categoryName.includes('entertainment') || categoryName.includes('game') || categoryName.includes('music')) {
    mappedCategory = 'entertainment'
  }

  // Parse price
  const price = parseFloat(row.search_price || row.display_price || row.store_price || '0')

  // Collect all available images
  const images = [
    row.merchant_image_url,
    row.aw_image_url,
    row.large_image,
    row.alternate_image,
    row.aw_thumb_url,
    row.alternate_image_two,
    row.alternate_image_three,
    row.alternate_image_four,
    row.merchant_thumb_url
  ].filter(Boolean)

  return {
    title: row.product_name || 'Untitled Product',
    description: row.description || row.product_short_description || '',
    price: price || 0,
    currency: row.currency || 'USD',
    category: mappedCategory,
    subcategory: mappedSubcategory,
    business_name: row.merchant_name || 'Unknown Merchant',
    business_type: 'business',
    images: images.slice(0, 5), // Limit to 5 images
    website: row.aw_deep_link || row.merchant_deep_link || '',
    contact_email: null,
    contact_phone: null,
    location: null,
    shipping_available: true,
    shipping_info: row.delivery_cost ? `Delivery cost: ${row.delivery_cost} ${row.currency || 'USD'}` : null,
    status: 'active',
    featured: false,
    price_type: 'fixed',
    social_media: {
      awin_product_id: row.aw_product_id,
      merchant_product_id: row.merchant_product_id,
      merchant_id: row.merchant_id,
      brand_name: row.brand_name,
      brand_id: row.brand_id,
      colour: row.colour,
      product_model: row.product_model,
      model_number: row.model_number,
      dimensions: row.dimensions,
      keywords: row.keywords,
      promotional_text: row.promotional_text,
      product_type: row.product_type,
      condition: row.condition,
      specifications: row.specifications,
      rrp_price: row.rrp_price,
      saving: row.saving,
      savings_percent: row.savings_percent,
      original_category: row.category_name,
      merchant_category: row.merchant_category,
      category_path: row.merchant_product_category_path,
      data_feed_id: row.data_feed_id,
      commission_group: row.commission_group,
      last_updated: row.last_updated
    },
    created_by: null // Will be set to a system user or admin
  }
}

Deno.serve(async (req) => {
  console.log('Starting Awin CSV products import...')

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const awinApiToken = Deno.env.get('AWIN_API_TOKEN')
    const awinAdvertiserId = Deno.env.get('AWIN_ADVERTISER_ID')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!awinApiToken || !awinAdvertiserId) {
      console.error('Missing Awin API credentials')
      return new Response(
        JSON.stringify({ error: 'Missing Awin API credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials')
      return new Response(
        JSON.stringify({ error: 'Missing Supabase credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body for parameters
    let requestBody: any = {}
    if (req.method === 'POST') {
      try {
        requestBody = await req.json()
      } catch (e) {
        console.log('No request body or invalid JSON, using defaults')
      }
    }

    const {
      csvUrl = '',
      maxProducts = 1000,
      skipRows = 0,
      batchSize = 100
    } = requestBody

    let feedUrl = csvUrl

    // If no custom URL provided, build default Awin CSV feed URL
    if (!feedUrl) {
      const columns = [
        'aw_deep_link', 'product_name', 'aw_product_id', 'merchant_product_id',
        'merchant_image_url', 'description', 'merchant_category', 'search_price',
        'merchant_name', 'merchant_id', 'category_name', 'category_id',
        'aw_image_url', 'currency', 'store_price', 'delivery_cost',
        'merchant_deep_link', 'language', 'last_updated', 'display_price',
        'data_feed_id', 'brand_name', 'brand_id', 'colour',
        'product_short_description', 'specifications', 'condition',
        'product_model', 'model_number', 'dimensions', 'keywords',
        'promotional_text', 'product_type', 'rrp_price'
      ].join(',')

      feedUrl = `https://productdata.awin.com/datafeed/download/apikey/${awinApiToken}/language/en/cid/${awinAdvertiserId}/hasEnhancedFeeds/0/columns/${columns}/format/csv/delimiter/%2C/compression/gzip/adultcontent/1/`
    }

    console.log('Downloading CSV feed from:', feedUrl)

    // Download the gzipped CSV file
    const response = await fetch(feedUrl)
    
    if (!response.ok) {
      console.error('Failed to download CSV feed:', response.status, response.statusText)
      return new Response(
        JSON.stringify({ error: `Failed to download CSV feed: ${response.status} ${response.statusText}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the compressed data as ArrayBuffer
    const compressedData = await response.arrayBuffer()
    console.log('Downloaded compressed file size:', compressedData.byteLength, 'bytes')

    // Decompress the gzip data
    const decompressedData = decompress(new Uint8Array(compressedData))
    const csvContent = new TextDecoder().decode(decompressedData)
    console.log('Decompressed CSV content size:', csvContent.length, 'characters')

    // Parse CSV content
    const csvRows = parseCSV(csvContent)
    console.log('Parsed CSV rows:', csvRows.length)

    if (csvRows.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No products found in CSV feed',
          imported: 0,
          total: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Limit the number of products to process
    const productsToProcess = csvRows.slice(skipRows, skipRows + maxProducts)
    console.log(`Processing ${productsToProcess.length} products (skipped ${skipRows}, max ${maxProducts})`)

    // Map CSV rows to marketplace listings format
    const marketplaceListings = productsToProcess
      .map(mapAwinRowToMarketplace)
      .filter(listing => listing.title && listing.title !== 'Untitled Product') // Filter out invalid products

    console.log(`Prepared ${marketplaceListings.length} valid listings for import`)

    // Insert products in batches to avoid timeout
    let totalInserted = 0
    const errors: string[] = []

    for (let i = 0; i < marketplaceListings.length; i += batchSize) {
      const batch = marketplaceListings.slice(i, i + batchSize)
      console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(marketplaceListings.length / batchSize)} (${batch.length} items)`)

      try {
        const { data: insertedListings, error: insertError } = await supabase
          .from('marketplace_listings')
          .insert(batch)
          .select('id, title, price, category')

        if (insertError) {
          console.error('Batch insert error:', insertError)
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`)
        } else {
          totalInserted += insertedListings?.length || 0
          console.log(`Successfully inserted batch: ${insertedListings?.length || 0} items`)
        }
      } catch (error) {
        console.error('Batch processing error:', error)
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
      }
    }

    console.log(`Import completed. Total inserted: ${totalInserted}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully imported ${totalInserted} products from Awin CSV feed`,
        imported: totalInserted,
        total: csvRows.length,
        processed: productsToProcess.length,
        skipped: skipRows,
        errors: errors.length > 0 ? errors : undefined,
        feed_url: feedUrl
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in import-awin-products function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
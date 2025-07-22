import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AwinProduct {
  aw_product_id: string
  merchant_product_id: string
  merchant_name: string
  merchant_id: string
  product_name: string
  description: string
  price: {
    amount: number
    currency: string
  }
  category: {
    name: string
    id: string
  }
  subcategory?: {
    name: string
    id: string
  }
  product_image: string
  product_url: string
  merchant_category: string
  brand_name?: string
  colour?: string
  size?: string
  gender?: string
  age_range?: string
  shipping_cost?: number
  shipping_time?: string
  stock_status: string
  last_updated: string
}

interface AwinProductsResponse {
  products: AwinProduct[]
  total_products: number
  page: number
  per_page: number
}

Deno.serve(async (req) => {
  console.log('Starting Awin products import...')

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
      category = '',
      limit = 100,
      page = 1,
      brand = '',
      minPrice = '',
      maxPrice = '',
      keywords = ''
    } = requestBody

    console.log(`Fetching Awin products with params:`, {
      category,
      limit,
      page,
      brand,
      minPrice,
      maxPrice,
      keywords
    })

    // Build Awin API URL
    const awinBaseUrl = 'https://productdata.awin.com/datafeed/list/apikey'
    const params = new URLSearchParams({
      apikey: awinApiToken,
      advertiser_id: awinAdvertiserId,
      limit: limit.toString(),
      page: page.toString(),
      format: 'json'
    })

    // Add optional filters
    if (category) params.append('category', category)
    if (brand) params.append('brand', brand)
    if (minPrice) params.append('min_price', minPrice.toString())
    if (maxPrice) params.append('max_price', maxPrice.toString())
    if (keywords) params.append('keywords', keywords)

    const awinUrl = `${awinBaseUrl}?${params.toString()}`
    console.log('Fetching from Awin API:', awinUrl)

    // Fetch products from Awin API
    const awinResponse = await fetch(awinUrl, {
      headers: {
        'Authorization': `Bearer ${awinApiToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!awinResponse.ok) {
      console.error('Awin API error:', awinResponse.status, await awinResponse.text())
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Awin API' }),
        { status: awinResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const awinData: AwinProductsResponse = await awinResponse.json()
    console.log(`Fetched ${awinData.products?.length || 0} products from Awin`)

    if (!awinData.products || awinData.products.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No products found',
          imported: 0,
          total: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Map Awin products to marketplace listings format
    const marketplaceListings = awinData.products.map((product: AwinProduct) => {
      // Determine category mapping
      let mappedCategory = 'other'
      let mappedSubcategory = product.subcategory?.name || null

      const categoryName = product.category?.name?.toLowerCase() || ''
      if (categoryName.includes('clothing') || categoryName.includes('fashion')) {
        mappedCategory = 'clothing'
      } else if (categoryName.includes('book')) {
        mappedCategory = 'books'
      } else if (categoryName.includes('health') || categoryName.includes('beauty')) {
        mappedCategory = 'health'
      } else if (categoryName.includes('tech') || categoryName.includes('electronic')) {
        mappedCategory = 'technology'
      } else if (categoryName.includes('art') || categoryName.includes('craft')) {
        mappedCategory = 'art'
      } else if (categoryName.includes('service')) {
        mappedCategory = 'services'
      }

      return {
        title: product.product_name || 'Untitled Product',
        description: product.description || '',
        price: product.price?.amount || 0,
        currency: product.price?.currency || 'USD',
        category: mappedCategory,
        subcategory: mappedSubcategory,
        business_name: product.merchant_name || 'Unknown Merchant',
        business_type: 'business',
        images: product.product_image ? [product.product_image] : [],
        website: product.product_url || '',
        contact_email: null,
        contact_phone: null,
        location: null,
        shipping_available: true,
        shipping_info: product.shipping_time ? `Estimated delivery: ${product.shipping_time}` : null,
        status: product.stock_status === 'in_stock' ? 'active' : 'inactive',
        featured: false,
        price_type: 'fixed',
        social_media: {
          awin_product_id: product.aw_product_id,
          merchant_product_id: product.merchant_product_id,
          merchant_id: product.merchant_id,
          brand_name: product.brand_name,
          colour: product.colour,
          size: product.size,
          gender: product.gender,
          age_range: product.age_range,
          original_category: product.category?.name,
          last_updated: product.last_updated
        },
        created_by: null // Will be set to a system user or admin
      }
    })

    console.log(`Prepared ${marketplaceListings.length} listings for import`)

    // Insert products into marketplace_listings table
    const { data: insertedListings, error: insertError } = await supabase
      .from('marketplace_listings')
      .insert(marketplaceListings)
      .select('id, title, price, category')

    if (insertError) {
      console.error('Error inserting listings:', insertError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to import products to marketplace',
          details: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Successfully imported ${insertedListings?.length || 0} products`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully imported ${insertedListings?.length || 0} products from Awin`,
        imported: insertedListings?.length || 0,
        total: awinData.total_products || 0,
        page: awinData.page || page,
        per_page: awinData.per_page || limit,
        products: insertedListings
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
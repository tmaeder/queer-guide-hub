import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

interface RefugeRestroom {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  accessible: boolean;
  unisex: boolean;
  changing_table: boolean;
  comment: string;
  directions: string;
  created_at: string;
  updated_at: string;
  upvote: number;
  downvote: number;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = getServiceClient()
    const auth = await requireAdmin(req, supabaseClient)
    if (auth instanceof Response) return auth

    console.log('Starting Refuge Restrooms import...')

    // Get or create toilet category
    let { data: toiletCategory, error: categoryError } = await supabaseClient
      .from('venue_categories')
      .select('id, name, slug')
      .eq('slug', 'toilet')
      .single()

    if (categoryError && categoryError.code === 'PGRST116') {
      // Category doesn't exist, create it
      console.log('Creating toilet category...')
      const { data: newCategory, error: createError } = await supabaseClient
        .from('venue_categories')
        .insert({
          name: 'Toilet',
          slug: 'toilet',
          description: 'Public restrooms and toilet facilities',
          icon: 'restroom',
          color: '#6366f1',
          is_active: true,
          sort_order: 0
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating toilet category:', createError)
        // Try to get existing category if it was created by another process
        const { data: existingCategory } = await supabaseClient
          .from('venue_categories')
          .select('id, name, slug')
          .eq('slug', 'toilet')
          .single()
        
        if (existingCategory) {
          toiletCategory = existingCategory
        } else {
          throw createError
        }
      } else {
        toiletCategory = newCategory
      }
    } else if (categoryError) {
      console.error('Error fetching toilet category:', categoryError)
      throw categoryError
    }

    console.log('Toilet category ID:', toiletCategory.id)

    // Fetch restrooms from Refuge API
    const response = await fetch('https://www.refugerestrooms.org/api/v1/restrooms?per_page=1000', {
      headers: {
        'User-Agent': 'Queer Guide App',
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch restrooms: ${response.status}`)
    }

    const restrooms: RefugeRestroom[] = await response.json()
    console.log(`Fetched ${restrooms.length} restrooms from Refuge API`)

    let importedCount = 0
    let updatedCount = 0
    let skippedCount = 0

    for (const restroom of restrooms) {
      try {
        // Check if venue already exists by external ID or coordinates
        const { data: existingVenue, error: checkError } = await supabaseClient
          .from('venues')
          .select('id')
          .eq('external_id', restroom.id.toString())
          .eq('external_source', 'refuge_restrooms')
          .single()

        if (checkError && checkError.code !== 'PGRST116') {
          console.error('Error checking existing venue:', checkError)
          continue
        }

        // Get or create city
        let city = null;
        if (restroom.city && restroom.city.trim()) {
          console.log(`Looking for city: ${restroom.city}`)
          const { data: existingCity, error: cityError } = await supabaseClient
            .from('cities')
            .select('id')
            .ilike('name', restroom.city.trim())
            .single()

          if (cityError && cityError.code === 'PGRST116') {
            // City doesn't exist, need to get country first
            let countryId = null;
            if (restroom.country) {
              const safeCountry = (restroom.country || '').replace(/[,%()\\]/g, '')
              const { data: country } = await supabaseClient
                .from('countries')
                .select('id')
                .or(`code.eq.${safeCountry},name.ilike.%${safeCountry}%`)
                .single()
              countryId = country?.id
            }

            // Only create city if we have required data
            if (countryId && restroom.latitude && restroom.longitude) {
              console.log(`Creating city: ${restroom.city} in country: ${restroom.country}`)
              const { data: newCity, error: createCityError } = await supabaseClient
                .from('cities')
                .insert({
                  name: restroom.city.trim(),
                  country_id: countryId,
                  latitude: restroom.latitude,
                  longitude: restroom.longitude
                })
                .select()
                .single()

              if (!createCityError) {
                city = newCity
              } else {
                console.error('Error creating city:', createCityError)
              }
            }
          } else if (!cityError) {
            city = existingCity
          }
        }

        // Prepare venue data
        const venueData = {
          name: restroom.name || `Restroom at ${restroom.street}`,
          description: restroom.comment || 'Public restroom facility',
          address: restroom.street,
          city: restroom.city,
          state: restroom.state,
          country: restroom.country || 'US',
          latitude: restroom.latitude,
          longitude: restroom.longitude,
          category_id: toiletCategory.id,
          city_id: city?.id,
          phone: null,
          website: null,
          email: null,
          hours: null,
          status: 'active',
          featured: false,
          verified: false,
          external_id: restroom.id.toString(),
          external_source: 'refuge_restrooms',
          external_data: {
            accessible: restroom.accessible,
            unisex: restroom.unisex,
            changing_table: restroom.changing_table,
            directions: restroom.directions,
            upvote: restroom.upvote,
            downvote: restroom.downvote,
            created_at: restroom.created_at,
            updated_at: restroom.updated_at
          }
        }

        if (existingVenue) {
          // Update existing venue
          const { error: updateError } = await supabaseClient
            .from('venues')
            .update(venueData)
            .eq('id', existingVenue.id)

          if (updateError) {
            console.error('Error updating venue:', updateError)
            skippedCount++
            continue
          }
          updatedCount++
          console.log(`Updated venue: ${venueData.name}`)
        } else {
          // Insert new venue
          const { error: insertError } = await supabaseClient
            .from('venues')
            .insert(venueData)

          if (insertError) {
            console.error('Error inserting venue:', insertError)
            skippedCount++
            continue
          }
          importedCount++
          console.log(`Imported venue: ${venueData.name}`)
        }

      } catch (error) {
        console.error('Error processing restroom:', error)
        skippedCount++
      }
    }

    const result = {
      message: 'Refuge Restrooms import completed',
      imported: importedCount,
      updated: updatedCount,
      skipped: skippedCount,
      total: restrooms.length
    }

    console.log('Import summary:', result)

    return new Response(
      JSON.stringify(result),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      },
    )

  } catch (error) {
    console.error('Error importing restrooms:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
      },
    )
  }
})
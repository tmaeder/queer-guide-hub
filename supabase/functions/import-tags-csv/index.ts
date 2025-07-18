import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TagData {
  name: string
  category: string
  description?: string
  color?: string
  image_url?: string
}

function parseCSV(csvText: string): TagData[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row')
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const requiredHeaders = ['name', 'category']
  
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required column: ${required}`)
    }
  }

  const tags: TagData[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    if (values.length !== headers.length) {
      console.warn(`Skipping line ${i + 1}: column count mismatch`)
      continue
    }

    const tag: TagData = {
      name: '',
      category: ''
    }

    headers.forEach((header, index) => {
      const value = values[index]
      switch (header) {
        case 'name':
          tag.name = value
          break
        case 'category':
          tag.category = value
          break
        case 'description':
          if (value) tag.description = value
          break
        case 'color':
          if (value) tag.color = value
          break
        case 'image_url':
          if (value) tag.image_url = value
          break
      }
    })

    if (tag.name && tag.category) {
      tags.push(tag)
    } else {
      console.warn(`Skipping line ${i + 1}: missing required fields`)
    }
  }

  return tags
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user has admin role
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formData = await req.formData()
    const csvFile = formData.get('csv') as File

    if (!csvFile) {
      return new Response(
        JSON.stringify({ error: 'CSV file is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (csvFile.type !== 'text/csv' && !csvFile.name.endsWith('.csv')) {
      return new Response(
        JSON.stringify({ error: 'File must be a CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const csvText = await csvFile.text()
    console.log('Parsing CSV with', csvText.split('\n').length, 'lines')

    const tags = parseCSV(csvText)
    console.log('Parsed', tags.length, 'tags')

    if (tags.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid tags found in CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for existing tags to avoid duplicates
    const existingTagNames = new Set()
    const { data: existingTags } = await supabase
      .from('tags')
      .select('name')
      .in('name', tags.map(t => t.name))

    if (existingTags) {
      existingTags.forEach(tag => existingTagNames.add(tag.name))
    }

    // Filter out existing tags
    const newTags = tags.filter(tag => !existingTagNames.has(tag.name))
    
    if (newTags.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'All tags already exist',
          skipped: tags.length,
          imported: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Insert new tags
    const { data: insertedTags, error: insertError } = await supabase
      .from('tags')
      .insert(newTags.map(tag => ({
        name: tag.name,
        category: tag.category,
        description: tag.description || null,
        color: tag.color || null,
        image_url: tag.image_url || null,
        is_active: true,
        usage_count: 0
      })))
      .select()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to insert tags', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully imported', insertedTags?.length || 0, 'tags')

    return new Response(
      JSON.stringify({
        message: 'Tags imported successfully',
        imported: insertedTags?.length || 0,
        skipped: tags.length - newTags.length,
        total: tags.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error importing tags:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
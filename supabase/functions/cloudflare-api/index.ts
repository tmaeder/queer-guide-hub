import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CloudflareConfig {
  zoneId: string
  accountId: string
  apiToken: string
  baseUrl: string
}

const getCloudflareConfig = (): CloudflareConfig => ({
  zoneId: 'fe9b9da8a08af32e10bb3ba7fdb04440',
  accountId: '7aa3765cc5f50f2b681b782eb4a8d296',
  apiToken: Deno.env.get('CLOUDFLARE_API_TOKEN') || '',
  baseUrl: 'https://api.cloudflare.com/client/v4'
})

const makeCloudflareRequest = async (endpoint: string, config: CloudflareConfig) => {
  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!userRole || userRole.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Admin role required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const config = getCloudflareConfig()

    if (!config.apiToken) {
      return new Response(
        JSON.stringify({ error: 'Cloudflare API token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let result: any

    switch (action) {
      case 'zone-info':
        result = await makeCloudflareRequest(`/zones/${config.zoneId}`, config)
        break

      case 'analytics':
        const since = url.searchParams.get('since') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const until = url.searchParams.get('until') || new Date().toISOString()
        result = await makeCloudflareRequest(
          `/zones/${config.zoneId}/analytics/dashboard?since=${since}&until=${until}`,
          config
        )
        break

      case 'dns-records':
        result = await makeCloudflareRequest(`/zones/${config.zoneId}/dns_records`, config)
        break

      case 'page-rules':
        result = await makeCloudflareRequest(`/zones/${config.zoneId}/pagerules`, config)
        break

      case 'cache-stats':
        result = await makeCloudflareRequest(
          `/zones/${config.zoneId}/analytics/colos?since=${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`,
          config
        )
        break

      case 'security-settings':
        const securitySettings = await Promise.all([
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/security_level`, config),
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/ssl`, config),
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/always_use_https`, config),
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/min_tls_version`, config),
        ])
        result = {
          success: true,
          result: {
            security_level: securitySettings[0].result,
            ssl: securitySettings[1].result,
            always_use_https: securitySettings[2].result,
            min_tls_version: securitySettings[3].result,
          }
        }
        break

      case 'performance-settings':
        const performanceSettings = await Promise.all([
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/browser_cache_ttl`, config),
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/cache_level`, config),
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/development_mode`, config),
          makeCloudflareRequest(`/zones/${config.zoneId}/settings/minify`, config),
        ])
        result = {
          success: true,
          result: {
            browser_cache_ttl: performanceSettings[0].result,
            cache_level: performanceSettings[1].result,
            development_mode: performanceSettings[2].result,
            minify: performanceSettings[3].result,
          }
        }
        break

      case 'bandwidth-stats':
        const bandwidthSince = url.searchParams.get('since') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const bandwidthUntil = url.searchParams.get('until') || new Date().toISOString()
        result = await makeCloudflareRequest(
          `/zones/${config.zoneId}/analytics/dashboard?since=${bandwidthSince}&until=${bandwidthUntil}&continuous=false`,
          config
        )
        break

      case 'threat-analytics':
        const threatSince = url.searchParams.get('since') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const threatUntil = url.searchParams.get('until') || new Date().toISOString()
        result = await makeCloudflareRequest(
          `/zones/${config.zoneId}/firewall/events?since=${threatSince}&until=${threatUntil}`,
          config
        )
        break

      case 'edge-certificates':
        result = await makeCloudflareRequest(`/zones/${config.zoneId}/ssl/certificate_packs`, config)
        break

      case 'workers':
        result = await makeCloudflareRequest(`/accounts/${config.accountId}/workers/scripts`, config)
        break

      case 'account-info':
        result = await makeCloudflareRequest(`/accounts/${config.accountId}`, config)
        break

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Available actions: zone-info, analytics, dns-records, page-rules, cache-stats, security-settings, performance-settings, bandwidth-stats, threat-analytics, edge-certificates, workers, account-info' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    console.log(`Cloudflare API ${action} request successful for user ${user.id}`)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cloudflare API error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
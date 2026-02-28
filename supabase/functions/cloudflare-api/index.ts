import { getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

interface CloudflareConfig {
  zoneId: string
  accountId: string
  apiToken: string
  baseUrl: string
}

function getCloudflareConfig(): CloudflareConfig | null {
  const zoneId = Deno.env.get('CLOUDFLARE_ZONE_ID')
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN')

  if (!zoneId || !accountId || !apiToken) return null

  return { zoneId, accountId, apiToken, baseUrl: 'https://api.cloudflare.com/client/v4' }
}

async function makeCloudflareRequest(endpoint: string, config: CloudflareConfig) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const supabase = getServiceClient()
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult

    let body: Record<string, unknown> = {}
    try {
      const rawBody = await req.text()
      if (rawBody) body = JSON.parse(rawBody)
    } catch {
      return errorResponse('Invalid request body', 400, req)
    }

    const { action, params = {} } = body as { action?: string; params?: Record<string, string> }
    const config = getCloudflareConfig()

    if (!config) {
      return errorResponse(
        'Cloudflare API not configured. Set CLOUDFLARE_ZONE_ID, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN in Supabase secrets.',
        503,
        req
      )
    }

    let result: unknown

    switch (action) {
      case 'zone-info':
        result = await makeCloudflareRequest(`/zones/${config.zoneId}`, config)
        break

      case 'analytics': {
        const since = (params as Record<string, string>).since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const until = (params as Record<string, string>).until || new Date().toISOString()
        try {
          result = await makeCloudflareRequest(
            `/zones/${config.zoneId}/analytics/dashboard?since=${since}&until=${until}`,
            config
          )
        } catch (error) {
          console.log('Analytics endpoint failed, trying alternative:', (error as Error).message)
          try {
            result = await makeCloudflareRequest(
              `/zones/${config.zoneId}/analytics/colos?since=${since}&until=${until}`,
              config
            )
          } catch {
            result = {
              success: true,
              result: {
                totals: {
                  requests: { all: 0, cached: 0 },
                  bandwidth: { all: 0, cached: 0 },
                  uniques: { all: 0 },
                  threats: { all: 0 }
                }
              }
            }
          }
        }
        break
      }

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

      case 'security-settings': {
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
      }

      case 'performance-settings': {
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
      }

      case 'bandwidth-stats': {
        const bandwidthSince = (params as Record<string, string>).since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const bandwidthUntil = (params as Record<string, string>).until || new Date().toISOString()
        result = await makeCloudflareRequest(
          `/zones/${config.zoneId}/analytics/dashboard?since=${bandwidthSince}&until=${bandwidthUntil}&continuous=false`,
          config
        )
        break
      }

      case 'threat-analytics': {
        const threatSince = (params as Record<string, string>).since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const threatUntil = (params as Record<string, string>).until || new Date().toISOString()
        try {
          result = await makeCloudflareRequest(
            `/zones/${config.zoneId}/firewall/events?since=${threatSince}&until=${threatUntil}`,
            config
          )
        } catch (error) {
          console.log('Threat analytics endpoint failed, trying alternative:', (error as Error).message)
          try {
            result = await makeCloudflareRequest(
              `/zones/${config.zoneId}/security/events?since=${threatSince}&until=${threatUntil}`,
              config
            )
          } catch {
            result = {
              success: true,
              result: [],
              result_info: { total_count: 0, page: 1, per_page: 20 }
            }
          }
        }
        break
      }

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
        return errorResponse(
          'Invalid action. Available: zone-info, analytics, dns-records, page-rules, cache-stats, security-settings, performance-settings, bandwidth-stats, threat-analytics, edge-certificates, workers, account-info',
          400,
          req
        )
    }

    return jsonResponse(result, 200, req)
  } catch (error) {
    console.error('Cloudflare API error:', error)
    return errorResponse('Internal server error', 500, req)
  }
})

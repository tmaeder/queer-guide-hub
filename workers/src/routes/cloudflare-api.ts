import type { Env } from '../types';
import { requireAdmin } from '../auth';
import { jsonResponse, errorResponse } from '../lib/response';

async function makeCloudflareRequest(
  endpoint: string,
  apiToken: string,
): Promise<unknown> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    throw new Error(`Cloudflare API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function handleCloudflareApi(
  req: Request,
  env: Env,
): Promise<Response> {
  const authErr = await requireAdmin(req, env);
  if (authErr) return errorResponse(authErr, 401);

  const { CLOUDFLARE_ZONE_ID: zoneId, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken } = env;

  if (!zoneId || !accountId || !apiToken) {
    return errorResponse('Cloudflare API not configured', 503);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return errorResponse('Invalid request body', 400);
  }

  const { action, params = {} } = body as {
    action?: string;
    params?: Record<string, string>;
  };

  try {
    let result: unknown;

    switch (action) {
      case 'zone-info':
        result = await makeCloudflareRequest(`/zones/${zoneId}`, apiToken);
        break;

      case 'analytics': {
        const since = params.since || new Date(Date.now() - 86400000).toISOString();
        const until = params.until || new Date().toISOString();
        try {
          result = await makeCloudflareRequest(
            `/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}`,
            apiToken,
          );
        } catch {
          result = {
            success: true,
            result: {
              totals: { requests: { all: 0, cached: 0 }, bandwidth: { all: 0, cached: 0 }, uniques: { all: 0 }, threats: { all: 0 } },
            },
          };
        }
        break;
      }

      case 'dns-records':
        result = await makeCloudflareRequest(`/zones/${zoneId}/dns_records`, apiToken);
        break;

      case 'page-rules':
        result = await makeCloudflareRequest(`/zones/${zoneId}/pagerules`, apiToken);
        break;

      case 'cache-stats':
        result = await makeCloudflareRequest(
          `/zones/${zoneId}/analytics/colos?since=${new Date(Date.now() - 86400000).toISOString()}`,
          apiToken,
        );
        break;

      case 'security-settings': {
        const [sl, ssl, https, tls] = await Promise.all([
          makeCloudflareRequest(`/zones/${zoneId}/settings/security_level`, apiToken),
          makeCloudflareRequest(`/zones/${zoneId}/settings/ssl`, apiToken),
          makeCloudflareRequest(`/zones/${zoneId}/settings/always_use_https`, apiToken),
          makeCloudflareRequest(`/zones/${zoneId}/settings/min_tls_version`, apiToken),
        ]);
        result = {
          success: true,
          result: {
            security_level: (sl as any).result,
            ssl: (ssl as any).result,
            always_use_https: (https as any).result,
            min_tls_version: (tls as any).result,
          },
        };
        break;
      }

      case 'performance-settings': {
        const [bttl, cl, dm, min] = await Promise.all([
          makeCloudflareRequest(`/zones/${zoneId}/settings/browser_cache_ttl`, apiToken),
          makeCloudflareRequest(`/zones/${zoneId}/settings/cache_level`, apiToken),
          makeCloudflareRequest(`/zones/${zoneId}/settings/development_mode`, apiToken),
          makeCloudflareRequest(`/zones/${zoneId}/settings/minify`, apiToken),
        ]);
        result = {
          success: true,
          result: {
            browser_cache_ttl: (bttl as any).result,
            cache_level: (cl as any).result,
            development_mode: (dm as any).result,
            minify: (min as any).result,
          },
        };
        break;
      }

      case 'bandwidth-stats': {
        const bwSince = params.since || new Date(Date.now() - 7 * 86400000).toISOString();
        const bwUntil = params.until || new Date().toISOString();
        result = await makeCloudflareRequest(
          `/zones/${zoneId}/analytics/dashboard?since=${bwSince}&until=${bwUntil}&continuous=false`,
          apiToken,
        );
        break;
      }

      case 'threat-analytics': {
        const tSince = params.since || new Date(Date.now() - 86400000).toISOString();
        const tUntil = params.until || new Date().toISOString();
        try {
          result = await makeCloudflareRequest(
            `/zones/${zoneId}/firewall/events?since=${tSince}&until=${tUntil}`,
            apiToken,
          );
        } catch {
          result = { success: true, result: [], result_info: { total_count: 0, page: 1, per_page: 20 } };
        }
        break;
      }

      case 'edge-certificates':
        result = await makeCloudflareRequest(`/zones/${zoneId}/ssl/certificate_packs`, apiToken);
        break;

      case 'workers':
        result = await makeCloudflareRequest(`/accounts/${accountId}/workers/scripts`, apiToken);
        break;

      case 'account-info':
        result = await makeCloudflareRequest(`/accounts/${accountId}`, apiToken);
        break;

      default:
        return errorResponse(
          'Invalid action. Available: zone-info, analytics, dns-records, page-rules, cache-stats, security-settings, performance-settings, bandwidth-stats, threat-analytics, edge-certificates, workers, account-info',
          400,
        );
    }

    return jsonResponse(result, 200);
  } catch (err) {
    console.error('Cloudflare API error:', err);
    return errorResponse('Internal server error', 500);
  }
}

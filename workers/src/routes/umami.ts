/**
 * umami-analytics — Analytics event recording via Supabase REST.
 * Records page views and custom events to the umami schema.
 */
import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/response';
import { supabaseRpc, supabaseRest } from '../supabase-rest';

interface AnalyticsPayload {
  hostname?: string;
  language?: string;
  referrer?: string;
  screen?: string;
  title?: string;
  url: string;
  name?: string;
  data?: Record<string, unknown>;
  browser?: string;
  os?: string;
  device?: string;
  country?: string;
}

export async function handleUmamiAnalytics(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  // Check origin is allowed
  const origin = req.headers.get('Origin') || '';
  if (!origin) {
    return jsonResponse({ success: false, error: 'Forbidden' }, 403);
  }

  try {
    const payload: AnalyticsPayload = await req.json();

    // Get website ID
    const { data: websites } = await supabaseRest<Array<{ website_id: string }>>(
      env,
      `/rest/v1/umami.website?name=eq.Queer Guide&select=website_id&limit=1`,
      { headers: { Accept: 'application/json' } },
    );

    if (!websites?.length) {
      return errorResponse('Website not found', 500);
    }

    const websiteId = websites[0].website_id;

    // Get or create session
    const { data: sessionId, error: sessionError } = await supabaseRpc<string>(
      env,
      'get_or_create_session',
      {
        p_website_id: websiteId,
        p_hostname: payload.hostname || 'localhost',
        p_browser: payload.browser || 'Unknown',
        p_os: payload.os || 'Unknown',
        p_device: payload.device || 'desktop',
        p_screen: payload.screen || '1920x1080',
        p_language: payload.language || 'en',
        p_country: payload.country || 'US',
      },
    );

    if (sessionError) {
      return errorResponse('Failed to create session', 500);
    }

    // Parse URL
    let urlPath = '/';
    let urlQuery = '';
    try {
      const urlObj = new URL(payload.url, `http://${payload.hostname || 'localhost'}`);
      urlPath = urlObj.pathname;
      urlQuery = urlObj.search;
    } catch { /* use defaults */ }

    let referrerPath: string | null = null;
    let referrerQuery: string | null = null;
    let referrerDomain: string | null = null;
    if (payload.referrer) {
      try {
        const ref = new URL(payload.referrer);
        referrerPath = ref.pathname;
        referrerQuery = ref.search;
        referrerDomain = ref.hostname;
      } catch { /* ignore */ }
    }

    // Insert event
    const { data: eventRows, error: eventError } = await supabaseRest<Array<{ event_id: string }>>(
      env,
      '/rest/v1/umami.website_event',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          website_id: websiteId,
          session_id: sessionId,
          url_path: urlPath,
          url_query: urlQuery,
          referrer_path: referrerPath,
          referrer_query: referrerQuery,
          referrer_domain: referrerDomain,
          page_title: payload.title || 'Unknown',
          event_type: payload.name ? 2 : 1,
          event_name: payload.name || null,
        },
      },
    );

    if (eventError) {
      return errorResponse('Failed to create event', 500);
    }

    // Store custom event data
    const eventId = eventRows?.[0]?.event_id;
    if (payload.data && payload.name && eventId) {
      const entries = Object.entries(payload.data).map(([key, value]) => {
        let dataType = 1;
        let stringValue: string | null = null;
        let numericValue: number | null = null;

        if (typeof value === 'number') {
          dataType = 2;
          numericValue = value;
        } else {
          stringValue = String(value);
        }

        return {
          event_id: eventId,
          event_key: key,
          event_string_value: stringValue,
          event_numeric_value: numericValue,
          event_date_value: null,
          event_data_type: dataType,
        };
      });

      await supabaseRest(env, '/rest/v1/umami.event_data', {
        method: 'POST',
        body: entries,
      });
    }

    return jsonResponse({ success: true, eventId }, 200);
  } catch (err) {
    console.error('Umami analytics error:', err);
    return errorResponse('Failed to process analytics event', 500);
  }
}

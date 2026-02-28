import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { getCorsHeaders } from '../_shared/supabase-client.ts';

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AnalyticsPayload {
  hostname?: string;
  language?: string;
  referrer?: string;
  screen?: string;
  title?: string;
  url: string;
  name?: string;
  data?: Record<string, any>;
  browser?: string;
  os?: string;
  device?: string;
  country?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting: check origin is allowed
  const origin = req.headers.get('Origin') ?? '';
  if (!origin || !corsHeaders['Access-Control-Allow-Origin']) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      }
    );
  }

  try {
    const body = await req.json();
    const payload: AnalyticsPayload = body;

    console.log('Received analytics payload:', payload);

    // Get the website ID for Queer Guide
    const { data: website, error: websiteError } = await supabase
      .from('umami.website')
      .select('website_id')
      .eq('name', 'Queer Guide')
      .single();

    if (websiteError || !website) {
      console.error('Website not found:', websiteError);
      throw new Error('Website not found');
    }

    const websiteId = website.website_id;

    // Get or create session using the database function
    const { data: sessionResult, error: sessionError } = await supabase
      .rpc('get_or_create_session', {
        p_website_id: websiteId,
        p_hostname: payload.hostname || 'localhost',
        p_browser: payload.browser || 'Unknown',
        p_os: payload.os || 'Unknown',
        p_device: payload.device || 'desktop',
        p_screen: payload.screen || '1920x1080',
        p_language: payload.language || 'en',
        p_country: payload.country || 'US'
      });

    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new Error('Failed to create session');
    }

    const sessionId = sessionResult;

    // Parse URL for path and query
    const urlObj = new URL(payload.url, `http://${payload.hostname || 'localhost'}`);

    // Insert website event
    const { data: eventData, error: eventError } = await supabase
      .from('umami.website_event')
      .insert({
        website_id: websiteId,
        session_id: sessionId,
        url_path: urlObj.pathname,
        url_query: urlObj.search,
        referrer_path: payload.referrer ? new URL(payload.referrer).pathname : null,
        referrer_query: payload.referrer ? new URL(payload.referrer).search : null,
        referrer_domain: payload.referrer ? new URL(payload.referrer).hostname : null,
        page_title: payload.title || 'Unknown',
        event_type: payload.name ? 2 : 1, // 1 for pageview, 2 for custom event
        event_name: payload.name || null
      })
      .select('event_id')
      .single();

    if (eventError) {
      console.error('Event error:', eventError);
      throw new Error('Failed to create event');
    }

    // If custom event data is provided, store it
    if (payload.data && payload.name && eventData) {
      const eventDataEntries = Object.entries(payload.data).map(([key, value]) => {
        let dataType = 1; // String
        let stringValue = null;
        let numericValue = null;
        let dateValue = null;

        if (typeof value === 'number') {
          dataType = 2;
          numericValue = value;
        } else if (value instanceof Date) {
          dataType = 3;
          dateValue = value;
        } else {
          stringValue = String(value);
        }

        return {
          event_id: eventData.event_id,
          event_key: key,
          event_string_value: stringValue,
          event_numeric_value: numericValue,
          event_date_value: dateValue,
          event_data_type: dataType
        };
      });

      const { error: dataError } = await supabase
        .from('umami.event_data')
        .insert(eventDataEntries);

      if (dataError) {
        console.error('Event data error:', dataError);
        // Don't throw here, as the main event was recorded successfully
      }
    }

    console.log('Analytics event recorded successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Event tracked successfully',
        eventId: eventData?.event_id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in umami-analytics function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to process analytics event'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

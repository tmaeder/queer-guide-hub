import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Serve the umami tracking script
    if (path === '/umami.js') {
      const script = `
(function() {
  'use strict';
  
  const website = 'queer-guide';
  const hostUrl = '${Deno.env.get('SUPABASE_URL')}/functions/v1';
  const autoTrack = true;
  const dnt = false;

  // Check for Do Not Track
  if (dnt && (navigator.doNotTrack === '1' || navigator.msDoNotTrack === '1')) {
    return;
  }

  const trackingDisabled = () => {
    const { doNotTrack, navigator: nav, external } = window;
    const msTrackProtection = 'msTrackingProtectionEnabled';
    const msTracking = () => external && msTrackProtection in external && external[msTrackProtection]();
    const dnt = doNotTrack || nav.doNotTrack || nav.msDoNotTrack || msTracking();
    return dnt === '1' || dnt === 'yes';
  };

  const getBrowserInfo = () => {
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'desktop';

    // Browser detection
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    // OS detection
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    // Device detection
    if (/Mobi|Android/i.test(userAgent)) device = 'mobile';
    else if (/Tablet|iPad/i.test(userAgent)) device = 'tablet';

    return { browser, os, device };
  };

  const track = (name, data) => {
    if (trackingDisabled()) return;

    const { browser, os, device } = getBrowserInfo();
    
    const payload = {
      url: location.pathname + location.search,
      title: document.title,
      hostname: location.hostname,
      language: navigator.language,
      referrer: document.referrer,
      screen: screen.width + 'x' + screen.height,
      browser,
      os,
      device,
    };

    if (name) {
      payload.name = name;
      payload.data = data;
    }

    fetch(hostUrl + '/umami-analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(console.error);
  };

  // Auto track page views
  if (autoTrack && !trackingDisabled()) {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const handlePageView = () => {
      setTimeout(() => track(), 300);
    };

    history.pushState = function() {
      originalPushState.apply(history, arguments);
      handlePageView();
    };

    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      handlePageView();
    };

    window.addEventListener('popstate', handlePageView);
    
    // Initial page load
    handlePageView();
  }

  // Expose umami object globally
  window.umami = { track };
})();
      `;

      return new Response(script, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        },
      });
    }

    // Analytics dashboard endpoint
    if (path === '/analytics' && req.method === 'GET') {
      const { data: stats, error } = await supabase
        .from('umami.website_event')
        .select(`
          *,
          umami.session(*)
        `)
        .eq('website_id', (
          await supabase
            .from('umami.website')
            .select('website_id')
            .eq('name', 'Queer Guide')
            .single()
        ).data?.website_id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });

  } catch (error) {
    console.error('Error in umami-dashboard function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
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
        .rpc('get_umami_analytics');

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle stats request from React app
    if (req.method === 'POST') {
      const body = await req.json();
      
      if (body.action === 'get_stats') {
        // Get website ID
        const { data: website } = await supabase
          .schema('umami')
          .from('website')
          .select('website_id')
          .eq('name', 'Queer Guide')
          .single();

        if (!website) {
          throw new Error('Website not found');
        }

        const websiteId = website.website_id;

        // Get events and sessions
        const [eventsResult, sessionsResult] = await Promise.all([
          supabase
            .schema('umami')
            .from('website_event')
            .select('*')
            .eq('website_id', websiteId)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .schema('umami')
            .from('session')
            .select('*')
            .eq('website_id', websiteId)
            .order('created_at', { ascending: false })
            .limit(100)
        ]);

        const events = eventsResult.data || [];
        const sessions = sessionsResult.data || [];

        // Calculate stats
        const totalPageViews = events.filter(e => e.event_type === 1).length;
        const totalSessions = sessions.length;
        const uniqueVisitors = new Set(sessions.map(s => s.session_id)).size;

        // Top pages
        const pageCounts = events
          .filter(e => e.event_type === 1)
          .reduce((acc, event) => {
            acc[event.url_path] = (acc[event.url_path] || 0) + 1;
            return acc;
          }, {});

        const topPages = Object.entries(pageCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([path, views]) => ({ path, views }));

        // Top browsers
        const browserCounts = sessions.reduce((acc, session) => {
          acc[session.browser] = (acc[session.browser] || 0) + 1;
          return acc;
        }, {});

        const topBrowsers = Object.entries(browserCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([browser, count]) => ({ browser, count }));

        // Top countries
        const countryCounts = sessions.reduce((acc, session) => {
          if (session.country) {
            acc[session.country] = (acc[session.country] || 0) + 1;
          }
          return acc;
        }, {});

        const topCountries = Object.entries(countryCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([country, count]) => ({ country, count }));

        const analyticsStats = {
          totalPageViews,
          totalSessions,
          uniqueVisitors,
          topPages,
          topBrowsers,
          topCountries,
          recentEvents: events.slice(0, 20)
        };

        return new Response(JSON.stringify(analyticsStats), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
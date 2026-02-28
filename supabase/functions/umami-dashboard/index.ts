import { getCorsHeaders, requireAdmin, getServiceClient, corsResponse } from '../_shared/supabase-client.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsResponse(req);
  }

  try {
    const supabase = getServiceClient();
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

    // Analytics dashboard endpoint - require admin auth for GET requests too
    if (path === '/analytics' && req.method === 'GET') {
      // Require admin authentication
      const authResult = await requireAdmin(req, supabase);
      if (authResult instanceof Response) return authResult;

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
      // Check admin access for analytics data
      const authResult = await requireAdmin(req, supabase);
      if (authResult instanceof Response) return authResult;

      const body = await req.json();

      if (body.action === 'get_enhanced_stats' || body.action === 'get_stats') {
        const { dateRange = '7d', deviceFilter = 'all', countryFilter = 'all' } = body;

        // Try to get website ID, create one if it doesn't exist
        let { data: website } = await supabase
          .schema('umami')
          .from('website')
          .select('website_id, name')
          .eq('name', 'Queer Guide')
          .single();

        if (!website) {
          // Try to get any website or create mock data
          const { data: websites } = await supabase
            .schema('umami')
            .from('website')
            .select('website_id, name')
            .limit(1);

          if (websites && websites.length > 0) {
            website = websites[0];
          } else {
            // Return mock analytics data if no website is configured
            const mockAnalyticsStats = {
              totalPageViews: 0,
              totalSessions: 0,
              uniqueVisitors: 0,
              avgSessionDuration: 0,
              bounceRate: 0,
              newVisitors: 0,
              returningVisitors: 0,
              topPages: [],
              topBrowsers: [],
              topCountries: [],
              topDevices: [],
              topLanguages: [],
              topScreens: [],
              hourlyData: Array.from({ length: 24 }, (_, hour) => ({
                hour: hour.toString().padStart(2, '0') + ':00',
                views: 0,
                sessions: 0
              })),
              dailyData: Array.from({ length: 7 }, (_, i) => {
                const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
                return {
                  date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  views: 0,
                  sessions: 0,
                  visitors: 0
                };
              }),
              recentEvents: [],
              liveVisitors: 0,
              totalUptime: 0,
              conversionRate: 0
            };

            return new Response(JSON.stringify(mockAnalyticsStats), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        const websiteId = website.website_id;

        // Calculate date range
        const now = new Date();
        const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

        // Get events and sessions with filters
        let sessionQuery = supabase
          .schema('umami')
          .from('session')
          .select('*')
          .eq('website_id', websiteId)
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false });

        if (deviceFilter !== 'all') {
          sessionQuery = sessionQuery.eq('device', deviceFilter);
        }

        if (countryFilter !== 'all') {
          sessionQuery = sessionQuery.eq('country', countryFilter);
        }

        let eventQuery = supabase
          .schema('umami')
          .from('website_event')
          .select('*')
          .eq('website_id', websiteId)
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false });

        const [eventsResult, sessionsResult] = await Promise.all([
          eventQuery,
          sessionQuery
        ]);

        const events = eventsResult.data || [];
        const sessions = sessionsResult.data || [];

        // Calculate enhanced stats
        const totalPageViews = events.filter(e => e.event_type === 1).length;
        const totalSessions = sessions.length;
        const uniqueVisitors = new Set(sessions.map(s => s.session_id)).size;

        // Calculate session durations
        const sessionDurations = sessions.map(session => {
          const sessionEvents = events.filter(e => e.session_id === session.session_id);
          if (sessionEvents.length < 2) return 0;
          const firstEvent = new Date(sessionEvents[sessionEvents.length - 1].created_at);
          const lastEvent = new Date(sessionEvents[0].created_at);
          return (lastEvent.getTime() - firstEvent.getTime()) / 1000;
        });

        const avgSessionDuration = sessionDurations.length > 0
          ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
          : 0;

        // Calculate bounce rate (sessions with only 1 page view)
        const singlePageSessions = sessions.filter(session => {
          const sessionPageViews = events.filter(e => e.session_id === session.session_id && e.event_type === 1);
          return sessionPageViews.length === 1;
        }).length;
        const bounceRate = totalSessions > 0 ? Math.round((singlePageSessions / totalSessions) * 100) : 0;

        // Calculate visitor types (simplified - assume returning if we've seen the session before)
        const now30DaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const { data: previousSessions } = await supabase
          .schema('umami')
          .from('session')
          .select('session_id')
          .eq('website_id', websiteId)
          .lt('created_at', startDate.toISOString())
          .gte('created_at', now30DaysAgo.toISOString());

        const previousSessionIds = new Set((previousSessions || []).map(s => s.session_id));
        const returningVisitors = sessions.filter(s => previousSessionIds.has(s.session_id)).length;
        const newVisitors = totalSessions - returningVisitors;

        // Top pages with percentages
        const pageCounts = events
          .filter(e => e.event_type === 1)
          .reduce((acc, event) => {
            acc[event.url_path] = (acc[event.url_path] || 0) + 1;
            return acc;
          }, {});

        const topPages = Object.entries(pageCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([path, views]) => ({
            path,
            views,
            percentage: Math.round((views / totalPageViews) * 100)
          }));

        // Top browsers with percentages
        const browserCounts = sessions.reduce((acc, session) => {
          acc[session.browser] = (acc[session.browser] || 0) + 1;
          return acc;
        }, {});

        const topBrowsers = Object.entries(browserCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([browser, count]) => ({
            browser,
            count,
            percentage: Math.round((count / totalSessions) * 100)
          }));

        // Top countries with percentages
        const countryCounts = sessions.reduce((acc, session) => {
          if (session.country) {
            acc[session.country] = (acc[session.country] || 0) + 1;
          }
          return acc;
        }, {});

        const topCountries = Object.entries(countryCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([country, count]) => ({
            country,
            count,
            percentage: Math.round((count / totalSessions) * 100)
          }));

        // Top devices
        const deviceCounts = sessions.reduce((acc, session) => {
          acc[session.device] = (acc[session.device] || 0) + 1;
          return acc;
        }, {});

        const topDevices = Object.entries(deviceCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([device, count]) => ({
            device,
            count,
            percentage: Math.round((count / totalSessions) * 100)
          }));

        // Top languages
        const languageCounts = sessions.reduce((acc, session) => {
          if (session.language) {
            acc[session.language] = (acc[session.language] || 0) + 1;
          }
          return acc;
        }, {});

        const topLanguages = Object.entries(languageCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([language, count]) => ({
            language,
            count,
            percentage: Math.round((count / totalSessions) * 100)
          }));

        // Top screen resolutions
        const screenCounts = sessions.reduce((acc, session) => {
          if (session.screen) {
            acc[session.screen] = (acc[session.screen] || 0) + 1;
          }
          return acc;
        }, {});

        const topScreens = Object.entries(screenCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([screen, count]) => ({
            screen,
            count,
            percentage: Math.round((count / totalSessions) * 100)
          }));

        // Hourly data
        const hourlyData = Array.from({ length: 24 }, (_, hour) => {
          const hourEvents = events.filter(e => {
            const eventHour = new Date(e.created_at).getHours();
            return eventHour === hour && e.event_type === 1;
          });
          const hourSessions = sessions.filter(s => {
            const sessionHour = new Date(s.created_at).getHours();
            return sessionHour === hour;
          });
          return {
            hour: hour.toString().padStart(2, '0') + ':00',
            views: hourEvents.length,
            sessions: hourSessions.length
          };
        });

        // Daily data
        const dailyData = Array.from({ length: daysBack }, (_, i) => {
          const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
          const dateStr = date.toISOString().split('T')[0];

          const dayEvents = events.filter(e => {
            const eventDate = new Date(e.created_at).toISOString().split('T')[0];
            return eventDate === dateStr && e.event_type === 1;
          });

          const daySessions = sessions.filter(s => {
            const sessionDate = new Date(s.created_at).toISOString().split('T')[0];
            return sessionDate === dateStr;
          });

          const dayVisitors = new Set(daySessions.map(s => s.session_id)).size;

          return {
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            views: dayEvents.length,
            sessions: daySessions.length,
            visitors: dayVisitors
          };
        });

        // Live visitors (sessions in last 5 minutes)
        const fiveMinutesAgo = new Date(now.getTime() - (5 * 60 * 1000));
        const { data: liveSessions } = await supabase
          .schema('umami')
          .from('session')
          .select('session_id')
          .eq('website_id', websiteId)
          .gte('created_at', fiveMinutesAgo.toISOString());

        const liveVisitors = new Set((liveSessions || []).map(s => s.session_id)).size;

        const analyticsStats = {
          totalPageViews,
          totalSessions,
          uniqueVisitors,
          avgSessionDuration,
          bounceRate,
          newVisitors,
          returningVisitors,
          topPages,
          topBrowsers,
          topCountries,
          topDevices,
          topLanguages,
          topScreens,
          hourlyData,
          dailyData,
          recentEvents: events.slice(0, 20),
          liveVisitors,
          totalUptime: 99.9, // Static for now
          conversionRate: Math.round((uniqueVisitors / totalSessions) * 100) || 0
        };

        return new Response(JSON.stringify(analyticsStats), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (body.action === 'export_data') {
        const { dateRange = '7d', deviceFilter = 'all', countryFilter = 'all' } = body;

        // Try to get website ID
        let { data: website } = await supabase
          .schema('umami')
          .from('website')
          .select('website_id, name')
          .eq('name', 'Queer Guide')
          .single();

        if (!website) {
          // Try to get any website
          const { data: websites } = await supabase
            .schema('umami')
            .from('website')
            .select('website_id, name')
            .limit(1);

          if (websites && websites.length > 0) {
            website = websites[0];
          } else {
            // Return empty export data
            return new Response(JSON.stringify({
              message: 'No analytics data available - Umami not configured',
              data: []
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        const websiteId = website.website_id;
        const now = new Date();
        const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

        // Get all data for export
        const [eventsResult, sessionsResult] = await Promise.all([
          supabase
            .schema('umami')
            .from('website_event')
            .select('*')
            .eq('website_id', websiteId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false }),
          supabase
            .schema('umami')
            .from('session')
            .select('*')
            .eq('website_id', websiteId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false })
        ]);

        const exportData = {
          exportDate: now.toISOString(),
          dateRange,
          filters: { deviceFilter, countryFilter },
          events: eventsResult.data || [],
          sessions: sessionsResult.data || []
        };

        return new Response(JSON.stringify(exportData), {
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
        error: 'Internal server error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

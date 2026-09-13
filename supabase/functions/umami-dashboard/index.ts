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

    // NOTE: this function used to also serve a second copy of the tracker at
    // /umami.js. That copy posted straight to the umami-analytics edge
    // function, bypassing both the consent gate in analyticsLoader.ts and the
    // /api/track proxy that attaches edge geo — so anything still fetching it
    // tracked pre-consent and landed with country NULL. public/umami.js is the
    // only tracker; removed 2026-09-12.

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
        const days = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 7;

        // All aggregation happens in SQL — the previous implementation pulled
        // raw rows through PostgREST (capped at max_rows = 1000) and computed
        // stats in JS, silently truncating every metric.
        const { data: stats, error } = await supabase.rpc('umami_dashboard_stats', {
          p_days: days,
          p_device: deviceFilter !== 'all' ? deviceFilter : null,
          p_country: countryFilter !== 'all' ? countryFilter : null,
        });

        if (error) throw error;

        if (!stats) {
          // No umami website row configured — return an all-zero payload.
          const emptyStats = {
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
            dailyData: [],
            recentEvents: [],
            liveVisitors: 0
          };
          return new Response(JSON.stringify(emptyStats), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(stats), {
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

        // Raw-row export. PostgREST caps unlimited selects at max_rows (1000);
        // request an explicit page and tell the consumer when it's truncated.
        const EXPORT_LIMIT = 10000;
        const [eventsResult, sessionsResult] = await Promise.all([
          supabase
            .schema('umami')
            .from('website_event')
            .select('*')
            .eq('website_id', websiteId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(EXPORT_LIMIT),
          supabase
            .schema('umami')
            .from('session')
            .select('*')
            .eq('website_id', websiteId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(EXPORT_LIMIT)
        ]);

        const events = eventsResult.data || [];
        const sessions = sessionsResult.data || [];
        const exportData = {
          exportDate: now.toISOString(),
          dateRange,
          filters: { deviceFilter, countryFilter },
          truncated: events.length === EXPORT_LIMIT || sessions.length === EXPORT_LIMIT,
          events,
          sessions
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

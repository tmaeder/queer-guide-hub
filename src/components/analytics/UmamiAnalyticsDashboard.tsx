import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Monitor, Users, Eye, Activity } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';

interface UmamiSession {
  session_id: string;
  hostname: string;
  browser: string;
  os: string;
  device: string;
  screen: string;
  language: string;
  country: string;
  city: string;
  created_at: string;
}

interface UmamiEvent {
  event_id: string;
  url_path: string;
  page_title: string;
  event_name: string;
  event_type: number;
  created_at: string;
  session: UmamiSession;
}

interface UmamiStats {
  totalPageViews: number;
  totalSessions: number;
  uniqueVisitors: number;
  topPages: Array<{ path: string; views: number }>;
  topBrowsers: Array<{ browser: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  recentEvents: UmamiEvent[];
}

export const UmamiAnalyticsDashboard = () => {
  const [stats, setStats] = useState<UmamiStats>({
    totalPageViews: 0,
    totalSessions: 0,
    uniqueVisitors: 0,
    topPages: [],
    topBrowsers: [],
    topCountries: [],
    recentEvents: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUmamiStats();
  }, []);

  const fetchUmamiStats = async () => {
    try {
      setLoading(true);
      
      // Use direct SQL queries via edge function since umami schema isn't in types
      const { data: analyticsData, error } = await supabase.functions.invoke('umami-dashboard', {
        body: { action: 'get_stats' }
      });

      if (error) {
        console.error('Error fetching Umami stats:', error);
        return;
      }

      if (analyticsData) {
        setStats({
          totalPageViews: analyticsData.totalPageViews || 0,
          totalSessions: analyticsData.totalSessions || 0,
          uniqueVisitors: analyticsData.uniqueVisitors || 0,
          topPages: analyticsData.topPages || [],
          topBrowsers: analyticsData.topBrowsers || [],
          topCountries: analyticsData.topCountries || [],
          recentEvents: analyticsData.recentEvents || []
        });
      }
    } catch (error) {
      console.error('Error fetching Umami stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Umami Analytics</h2>
          <p className="text-muted-foreground">Self-hosted website analytics dashboard</p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Activity className="h-3 w-3" />
          Live Tracking
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Page Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPageViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Tracked page visits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">User sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueVisitors.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Distinct visitors</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Pages and Browsers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Top Pages
            </CardTitle>
            <CardDescription>Most visited pages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topPages.map((page, index) => (
                <div key={page.path} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                      {index + 1}
                    </Badge>
                    <span className="font-mono text-sm">{page.path}</span>
                  </div>
                  <Badge variant="outline">{page.views} views</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Top Browsers
            </CardTitle>
            <CardDescription>Most used browsers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topBrowsers.map((browser, index) => (
                <div key={browser.browser} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                      {index + 1}
                    </Badge>
                    <span className="text-sm">{browser.browser}</span>
                  </div>
                  <Badge variant="outline">{browser.count} sessions</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Countries and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Top Countries
            </CardTitle>
            <CardDescription>Visitor locations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topCountries.map((country, index) => (
                <div key={country.country} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                      {index + 1}
                    </Badge>
                    <span className="text-sm">{country.country || 'Unknown'}</span>
                  </div>
                  <Badge variant="outline">{country.count} visitors</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest page views and events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {stats.recentEvents.slice(0, 10).map((event) => (
                <div key={event.event_id} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-mono">{event.url_path}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.session?.browser} • {event.session?.country}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
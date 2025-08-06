import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Calendar, MapPin, Monitor, Users, Eye, Activity, Clock, Globe, Smartphone, TrendingUp, Filter, Download, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
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
  avgSessionDuration: number;
  bounceRate: number;
  newVisitors: number;
  returningVisitors: number;
  topPages: Array<{
    path: string;
    views: number;
    percentage: number;
  }>;
  topBrowsers: Array<{
    browser: string;
    count: number;
    percentage: number;
  }>;
  topCountries: Array<{
    country: string;
    count: number;
    percentage: number;
  }>;
  topDevices: Array<{
    device: string;
    count: number;
    percentage: number;
  }>;
  topLanguages: Array<{
    language: string;
    count: number;
    percentage: number;
  }>;
  topScreens: Array<{
    screen: string;
    count: number;
    percentage: number;
  }>;
  hourlyData: Array<{
    hour: string;
    views: number;
    sessions: number;
  }>;
  dailyData: Array<{
    date: string;
    views: number;
    sessions: number;
    visitors: number;
  }>;
  recentEvents: UmamiEvent[];
  liveVisitors: number;
  totalUptime: number;
  conversionRate: number;
}
const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', 'hsl(var(--destructive))', 'hsl(var(--warning))'];
export const UmamiAnalyticsDashboard = () => {
  const [stats, setStats] = useState<UmamiStats>({
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
    hourlyData: [],
    dailyData: [],
    recentEvents: [],
    liveVisitors: 0,
    totalUptime: 0,
    conversionRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'custom'>('7d');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  useEffect(() => {
    fetchUmamiStats();

    // Auto-refresh every 5 minutes if enabled
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchUmamiStats(true);
      }, 5 * 60 * 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [dateRange, deviceFilter, countryFilter, autoRefresh]);
  const fetchUmamiStats = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Get current session for auth header
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      const {
        data: analyticsData,
        error
      } = await supabase.functions.invoke('umami-dashboard', {
        body: {
          action: 'get_enhanced_stats',
          dateRange,
          deviceFilter,
          countryFilter
        },
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : {}
      });
      if (error) {
        console.error('Error fetching Umami stats:', error);
        return;
      }
      if (analyticsData) {
        setStats(analyticsData);
      }
    } catch (error) {
      console.error('Error fetching Umami stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  const handleRefresh = () => {
    fetchUmamiStats(true);
  };
  const handleExport = async () => {
    try {
      // Get current session for auth header
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      const {
        data
      } = await supabase.functions.invoke('umami-dashboard', {
        body: {
          action: 'export_data',
          dateRange,
          deviceFilter,
          countryFilter
        },
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : {}
      });
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };
  if (loading) {
    return <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardHeader>
            </Card>)}
        </div>
      </div>;
  }
  return <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          
          
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            {stats.liveVisitors} Live
          </Badge>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Date Range:</label>
              <Select value={dateRange} onValueChange={(value: '7d' | '30d' | '90d' | 'custom') => setDateRange(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Device:</label>
              <Select value={deviceFilter} onValueChange={(value: 'all' | 'desktop' | 'mobile' | 'tablet') => setDeviceFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="tablet">Tablet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Auto Refresh:</label>
              <Button variant={autoRefresh ? "default" : "outline"} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
                {autoRefresh ? "ON" : "OFF"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPageViews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+12.5% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+8.2% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueVisitors.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+15.3% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(stats.avgSessionDuration / 60)}m</div>
            <p className="text-xs text-muted-foreground">Session duration</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bounceRate}%</div>
            <p className="text-xs text-muted-foreground">Single page visits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">Goal completion</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="technology">Technology</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Traffic Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Traffic Overview</CardTitle>
              <CardDescription>Page views and sessions over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={stats.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="views" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="sessions" stackId="1" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary))" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Hourly Pattern */}
          <Card>
            <CardHeader>
              <CardTitle>Hourly Traffic Pattern</CardTitle>
              <CardDescription>Traffic distribution by hour of day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="views" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>Most visited pages with performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.topPages.map((page, index) => <div key={page.path} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant="secondary" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                        {index + 1}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-medium">{page.path}</p>
                        <Progress value={page.percentage} className="h-2 mt-1" />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{page.views.toLocaleString()} views</p>
                      <p className="text-xs text-muted-foreground">{page.percentage}%</p>
                    </div>
                  </div>)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audience" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Countries Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Top Countries</CardTitle>
                <CardDescription>Visitor distribution by country</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={stats.topCountries.slice(0, 5)} cx="50%" cy="50%" labelLine={false} label={({
                    country,
                    percentage
                  }) => `${country} ${percentage}%`} outerRadius={80} fill="#8884d8" dataKey="count">
                      {stats.topCountries.slice(0, 5).map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* New vs Returning */}
            <Card>
              <CardHeader>
                <CardTitle>Visitor Type</CardTitle>
                <CardDescription>New vs returning visitors</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={[{
                    name: 'New Visitors',
                    value: stats.newVisitors
                  }, {
                    name: 'Returning Visitors',
                    value: stats.returningVisitors
                  }]} cx="50%" cy="50%" labelLine={false} label={({
                    name,
                    value
                  }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                      <Cell fill="hsl(var(--primary))" />
                      <Cell fill="hsl(var(--secondary))" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="technology" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Browsers */}
            <Card>
              <CardHeader>
                <CardTitle>Browsers</CardTitle>
                <CardDescription>Most used browsers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.topBrowsers.map((browser, index) => <div key={browser.browser} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Badge variant="secondary" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                          {index + 1}
                        </Badge>
                        <span className="text-sm">{browser.browser}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{browser.count}</p>
                        <p className="text-xs text-muted-foreground">{browser.percentage}%</p>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>

            {/* Devices */}
            <Card>
              <CardHeader>
                <CardTitle>Devices</CardTitle>
                <CardDescription>Device types</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.topDevices.map((device, index) => <div key={device.device} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{device.device}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{device.count}</p>
                        <p className="text-xs text-muted-foreground">{device.percentage}%</p>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>

            {/* Screen Resolutions */}
            <Card>
              <CardHeader>
                <CardTitle>Screen Sizes</CardTitle>
                <CardDescription>Most common screen resolutions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.topScreens.map((screen, index) => <div key={screen.screen} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-mono">{screen.screen}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{screen.count}</p>
                        <p className="text-xs text-muted-foreground">{screen.percentage}%</p>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="realtime" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Live Activity
                </CardTitle>
                <CardDescription>Real-time visitor activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-500">{stats.liveVisitors}</div>
                    <p className="text-sm text-muted-foreground">Active visitors right now</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Page views (last hour)</span>
                      <span className="font-medium">{stats.hourlyData[stats.hourlyData.length - 1]?.views || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Sessions (last hour)</span>
                      <span className="font-medium">{stats.hourlyData[stats.hourlyData.length - 1]?.sessions || 0}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
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
                  {stats.recentEvents.slice(0, 10).map(event => <div key={event.event_id} className="flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-mono">{event.url_path}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.session?.browser} • {event.session?.country}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleTimeString()}
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

    </div>;
};
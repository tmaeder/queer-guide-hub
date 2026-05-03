import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Monitor,
  Users,
  Eye,
  Activity,
  Clock,
  Globe,
  Smartphone,
  TrendingUp,
  Filter,
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { UmamiMap } from './UmamiMap';

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

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
  'hsl(var(--muted))',
  'hsl(var(--destructive))',
  'hsl(var(--warning))',
];

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
    conversionRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'custom'>('7d');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all');
  const [countryFilter, _setCountryFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchUmamiStats();

    // Auto-refresh every 5 minutes if enabled
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(
        () => {
          fetchUmamiStats(true);
        },
        5 * 60 * 1000,
      );
    }

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUmamiStats defined below, re-run on filter changes
  }, [dateRange, deviceFilter, countryFilter, autoRefresh]);

  const fetchUmamiStats = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Get current session for auth header
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data: analyticsData, error } = await supabase.functions.invoke('umami-dashboard', {
        body: {
          action: 'get_enhanced_stats',
          dateRange,
          deviceFilter,
          countryFilter,
        },
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : {},
      });

      if (error) {
        console.error('Error fetching Umami stats:', error);
        setError('Failed to load analytics data. Umami may not be configured yet.');
        return;
      }

      if (analyticsData) {
        setStats(analyticsData);
      }
    } catch (error) {
      console.error('Error fetching Umami stats:', error);
      setError('Analytics service unavailable. Please check your configuration.');
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
        data: { session },
      } = await supabase.auth.getSession();
      const { data } = await supabase.functions.invoke('umami-dashboard', {
        body: {
          action: 'export_data',
          dateRange,
          deviceFilter,
          countryFilter,
        },
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : {},
      });
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
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
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-accent rounded-sm w-3/4" />
                <div className="h-8 bg-accent rounded-sm w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-md">
                <Activity style={{ height: 24, width: 24 }} />
              </div>
              <div>
                <CardTitle>Analytics Unavailable</CardTitle>
                <CardDescription>{error}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                To enable analytics tracking, you need to configure Umami analytics:
              </p>
              <ol className="list-decimal list-inside flex flex-col gap-2 text-sm text-muted-foreground">
                <li>Set up an Umami instance or use Umami Cloud</li>
                <li>Create a website tracking code</li>
                <li>Add the tracking script to your site</li>
                <li>Configure the database connection</li>
              </ol>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <RefreshCw
                    style={{
                      height: 16,
                      width: 16,
                      ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}),
                    }}
                  />
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div></div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <span
              className="rounded-full"
              style={{
                width: 8,
                height: 8,
                backgroundColor: 'green',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
            {stats.liveVisitors} Live
          </Badge>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw
              style={{
                height: 12,
                width: 12,
                ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}),
              }}
            />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download style={{ height: 12, width: 12 }} />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Filter style={{ height: 16, width: 16 }} />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- pre-existing from MUI batch migration */}
              <label className="text-sm font-medium">Date Range:</label>
              <Select
                value={dateRange}
                onValueChange={(value: '7d' | '30d' | '90d' | 'custom') => setDateRange(value)}
              >
                <SelectTrigger>
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
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- pre-existing from MUI batch migration */}
              <label className="text-sm font-medium">Device:</label>
              <Select
                value={deviceFilter}
                onValueChange={(value: 'all' | 'desktop' | 'mobile' | 'tablet') =>
                  setDeviceFilter(value)
                }
              >
                <SelectTrigger>
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
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- pre-existing from MUI batch migration */}
              <label className="text-sm font-medium">Auto Refresh:</label>
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? 'ON' : 'OFF'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Page Views</CardTitle>
            <Eye style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalPageViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total page views</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalSessions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unique Visitors</CardTitle>
            <Monitor style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.uniqueVisitors.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Unique visitors</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avg. Duration</CardTitle>
            <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Math.round(stats.avgSessionDuration / 60)}m</p>
            <p className="text-xs text-muted-foreground">Session duration</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bounce Rate</CardTitle>
            <TrendingUp style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.bounceRate}%</p>
            <p className="text-xs text-muted-foreground">Single page visits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion</CardTitle>
            <Globe style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Goal completion</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
          <TabsTrigger value="technology">Technology</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
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
                  <Area
                    type="monotone"
                    dataKey="views"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    stackId="1"
                    stroke="hsl(var(--secondary))"
                    fill="hsl(var(--secondary))"
                    fillOpacity={0.6}
                  />
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
                  <Bar dataKey="views" fill="hsl(var(--primary))" animationDuration={800} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages">
          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>Most visited pages with performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {stats.topPages.map((page, index) => (
                  <div key={page.path} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <div className="flex-1">
                        <p className="font-mono text-sm font-medium">{page.path}</p>
                        <Progress value={page.percentage} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{page.views.toLocaleString()} views</p>
                      <p className="text-xs text-muted-foreground">{page.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audience">
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
                    <Pie
                      data={stats.topCountries.slice(0, 5)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ country, percentage }) => `${country} ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {stats.topCountries.slice(0, 5).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
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
                    <Pie
                      data={[
                        {
                          name: 'New Visitors',
                          value: stats.newVisitors,
                        },
                        {
                          name: 'Returning Visitors',
                          value: stats.returningVisitors,
                        },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
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

        <TabsContent value="geography">
          <UmamiMap countryData={stats.topCountries} loading={loading} />

          {/* Country Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>Country Details</CardTitle>
              <CardDescription>Detailed breakdown of visitors by country</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {stats.topCountries.map((country, index) => (
                  <div
                    key={country.country}
                    className="flex items-center justify-between p-3 rounded-md border"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{index + 1}</Badge>
                      <div>
                        <p className="font-medium">{country.country}</p>
                        <p className="text-xs text-muted-foreground">
                          {country.percentage}% of total traffic
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{country.count.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">visitors</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technology">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Browsers */}
            <Card>
              <CardHeader>
                <CardTitle>Browsers</CardTitle>
                <CardDescription>Most used browsers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {stats.topBrowsers.map((browser, index) => (
                    <div key={browser.browser} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Badge variant="secondary">{index + 1}</Badge>
                        <span className="text-sm">{browser.browser}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{browser.count}</p>
                        <p className="text-xs text-muted-foreground">{browser.percentage}%</p>
                      </div>
                    </div>
                  ))}
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
                <div className="flex flex-col gap-3">
                  {stats.topDevices.map((device, _index) => (
                    <div key={device.device} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Smartphone
                          style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }}
                        />
                        <span className="text-sm">{device.device}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{device.count}</p>
                        <p className="text-xs text-muted-foreground">{device.percentage}%</p>
                      </div>
                    </div>
                  ))}
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
                <div className="flex flex-col gap-3">
                  {stats.topScreens.map((screen, _index) => (
                    <div key={screen.screen} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <Monitor
                          style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }}
                        />
                        <span className="text-sm font-mono">{screen.screen}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{screen.count}</p>
                        <p className="text-xs text-muted-foreground">{screen.percentage}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="realtime">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Activity */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <span
                    className="rounded-full inline-block"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: 'green',
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }}
                  />
                  Live Activity
                </CardTitle>
                <CardDescription>Real-time visitor activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <div className="text-center">
                    <p className="text-4xl font-bold" style={{ color: 'green' }}>
                      {stats.liveVisitors}
                    </p>
                    <p className="text-sm text-muted-foreground">Active visitors right now</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span>Page views (last hour)</span>
                      <span className="font-medium">
                        {stats.hourlyData[stats.hourlyData.length - 1]?.views || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Sessions (last hour)</span>
                      <span className="font-medium">
                        {stats.hourlyData[stats.hourlyData.length - 1]?.sessions || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Activity style={{ height: 16, width: 16 }} />
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest page views and events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
                  {stats.recentEvents.slice(0, 10).map((event) => (
                    <div
                      key={event.event_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                          {event.url_path}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.session?.browser} • {event.session?.country}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

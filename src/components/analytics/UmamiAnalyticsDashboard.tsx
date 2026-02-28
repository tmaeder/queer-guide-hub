import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
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
  const [error, setError] = useState<string | null>(null);
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
      setError(null);

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
    return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
          {[...Array(3)].map((_, i) => <Card key={i} sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
              <CardHeader sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '75%' }}></Box>
                <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '50%' }}></Box>
              </CardHeader>
            </Card>)}
        </Box>
      </Box>;
  }

  if (error) {
    return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardHeader>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, bgcolor: 'error.light', opacity: 0.1, borderRadius: 2 }}>
                <Activity style={{ height: 24, width: 24 }} />
              </Box>
              <Box>
                <CardTitle>Analytics Unavailable</CardTitle>
                <CardDescription>{error}</CardDescription>
              </Box>
            </Box>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                To enable analytics tracking, you need to configure Umami analytics:
              </Typography>
              <Box component="ol" sx={{ listStyle: 'decimal', listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
                <li>Set up an Umami instance or use Umami Cloud</li>
                <li>Create a website tracking code</li>
                <li>Add the tracking script to your site</li>
                <li>Configure the database connection</li>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button variant="outline" onClick={handleRefresh} disabled={refreshing} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <RefreshCw style={{ height: 16, width: 16, ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}) }} />
                  Retry
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>;
  }

  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>


        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge variant="outline" sx={{ gap: 1 }}>
            <Box sx={{ width: 8, height: 8, bgcolor: 'green', borderRadius: '50%', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            {stats.liveVisitors} Live
          </Badge>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} sx={{ gap: 1 }}>
            <RefreshCw style={{ height: 12, width: 12, ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}) }} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} sx={{ gap: 1 }}>
            <Download style={{ height: 12, width: 12 }} />
            Export
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Filter style={{ height: 16, width: 16 }} />
            Filters & Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Date Range:</Typography>
              <Select value={dateRange} onValueChange={(value: '7d' | '30d' | '90d' | 'custom') => setDateRange(value)}>
                <SelectTrigger sx={{ width: 128 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Device:</Typography>
              <Select value={deviceFilter} onValueChange={(value: 'all' | 'desktop' | 'mobile' | 'tablet') => setDeviceFilter(value)}>
                <SelectTrigger sx={{ width: 128 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="tablet">Tablet</SelectItem>
                </SelectContent>
              </Select>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Auto Refresh:</Typography>
              <Button variant={autoRefresh ? "default" : "outline"} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
                {autoRefresh ? "ON" : "OFF"}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Page Views</CardTitle>
            <Eye style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.totalPageViews.toLocaleString()}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Total page views</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Sessions</CardTitle>
            <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.totalSessions.toLocaleString()}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Total sessions</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Unique Visitors</CardTitle>
            <Monitor style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.uniqueVisitors.toLocaleString()}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Unique visitors</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Avg. Duration</CardTitle>
            <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(stats.avgSessionDuration / 60)}m</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Session duration</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Bounce Rate</CardTitle>
            <TrendingUp style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.bounceRate}%</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Single page visits</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Conversion</CardTitle>
            <Globe style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.conversionRate}%</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Goal completion</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Charts and Analytics */}
      <Tabs defaultValue="overview" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
          <TabsTrigger value="technology">Technology</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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

        <TabsContent value="pages" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>Most visited pages with performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stats.topPages.map((page, index) => <Box key={page.path} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                      <Badge variant="secondary" sx={{ width: 24, height: 24, borderRadius: '50%', p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>
                        {index + 1}
                      </Badge>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 500 }}>{page.path}</Typography>
                        <Progress value={page.percentage} sx={{ height: 8, mt: 0.5 }} />
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{page.views.toLocaleString()} views</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{page.percentage}%</Typography>
                    </Box>
                  </Box>)}
              </Box>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audience" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
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
          </Box>
        </TabsContent>

        <TabsContent value="geography" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <UmamiMap countryData={stats.topCountries} loading={loading} />

          {/* Country Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>Country Details</CardTitle>
              <CardDescription>Detailed breakdown of visitors by country</CardDescription>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {stats.topCountries.map((country, index) => (
                  <Box key={country.country} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Badge variant="outline" sx={{ width: 32, height: 32, borderRadius: '50%', p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>
                        {index + 1}
                      </Badge>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>{country.country}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {country.percentage}% of total traffic
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 500 }}>{country.count.toLocaleString()}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>visitors</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technology" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
            {/* Browsers */}
            <Card>
              <CardHeader>
                <CardTitle>Browsers</CardTitle>
                <CardDescription>Most used browsers</CardDescription>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {stats.topBrowsers.map((browser, index) => <Box key={browser.browser} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Badge variant="secondary" sx={{ width: 24, height: 24, borderRadius: '50%', p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>
                          {index + 1}
                        </Badge>
                        <Box component="span" sx={{ fontSize: '0.875rem' }}>{browser.browser}</Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{browser.count}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{browser.percentage}%</Typography>
                      </Box>
                    </Box>)}
                </Box>
              </CardContent>
            </Card>

            {/* Devices */}
            <Card>
              <CardHeader>
                <CardTitle>Devices</CardTitle>
                <CardDescription>Device types</CardDescription>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {stats.topDevices.map((device, index) => <Box key={device.device} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Smartphone style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                        <Box component="span" sx={{ fontSize: '0.875rem' }}>{device.device}</Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{device.count}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{device.percentage}%</Typography>
                      </Box>
                    </Box>)}
                </Box>
              </CardContent>
            </Card>

            {/* Screen Resolutions */}
            <Card>
              <CardHeader>
                <CardTitle>Screen Sizes</CardTitle>
                <CardDescription>Most common screen resolutions</CardDescription>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {stats.topScreens.map((screen, index) => <Box key={screen.screen} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Monitor style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                        <Box component="span" sx={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{screen.screen}</Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{screen.count}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{screen.percentage}%</Typography>
                      </Box>
                    </Box>)}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </TabsContent>

        <TabsContent value="realtime" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
            {/* Live Activity */}
            <Card>
              <CardHeader>
                <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: 'green', borderRadius: '50%', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                  Live Activity
                </CardTitle>
                <CardDescription>Real-time visitor activity</CardDescription>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '2.25rem', fontWeight: 'bold', color: 'green' }}>{stats.liveVisitors}</Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Active visitors right now</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <Box component="span">Page views (last hour)</Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>{stats.hourlyData[stats.hourlyData.length - 1]?.views || 0}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <Box component="span">Sessions (last hour)</Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>{stats.hourlyData[stats.hourlyData.length - 1]?.sessions || 0}</Box>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Activity style={{ height: 16, width: 16 }} />
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest page views and events</CardDescription>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 320, overflowY: 'auto' }}>
                  {stats.recentEvents.slice(0, 10).map(event => <Box key={event.event_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{event.url_path}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {event.session?.browser} • {event.session?.country}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {new Date(event.created_at).toLocaleTimeString()}
                      </Typography>
                    </Box>)}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </TabsContent>
      </Tabs>

    </Box>;
};

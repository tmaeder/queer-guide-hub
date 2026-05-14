import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cloudflareAPI, type CloudflareAnalytics, type CloudflareZoneInfo, type CloudflareSecuritySettings, type CloudflarePerformanceSettings } from '@/integrations/supabase/cloudflare';
import { InlineLoading } from '@/components/ui/loading';
import {
  Cloud,
  Shield,
  Zap,
  BarChart3,
  Globe,
  Lock,
  Activity,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';

interface CloudflareStats {
  analytics?: CloudflareAnalytics | null;
  zoneInfo?: CloudflareZoneInfo | null;
  securitySettings?: CloudflareSecuritySettings | null;
  performanceSettings?: CloudflarePerformanceSettings | null;
  threatAnalytics?: Record<string, unknown> | null;
}

export function CloudflareDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<CloudflareStats>({});

  const fetchCloudflareData = async (showRefreshToast = false) => {
    try {
      if (showRefreshToast) setRefreshing(true);

      const testResult = await cloudflareAPI.getZoneInfo();

      const [analytics, zoneInfo, securitySettings, performanceSettings, threatAnalytics] =
        await Promise.allSettled([
          cloudflareAPI.getAnalytics(),
          Promise.resolve(testResult),
          cloudflareAPI.getSecuritySettings(),
          cloudflareAPI.getPerformanceSettings(),
          cloudflareAPI.getThreatAnalytics(),
        ]);

      setStats({
        analytics: analytics.status === 'fulfilled' ? analytics.value : null,
        zoneInfo: zoneInfo.status === 'fulfilled' ? zoneInfo.value : null,
        securitySettings: securitySettings.status === 'fulfilled' ? securitySettings.value : null,
        performanceSettings:
          performanceSettings.status === 'fulfilled' ? performanceSettings.value : null,
        threatAnalytics: threatAnalytics.status === 'fulfilled' ? threatAnalytics.value : null,
      });

      if (showRefreshToast) {
        toast.success('Cloudflare Data Refreshed: Latest statistics have been loaded successfully.');
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error fetching Cloudflare data:', error);

      let errorMessage = 'Failed to fetch Cloudflare data.';

      if (error.message?.includes('API token not configured')) {
        errorMessage =
          'Cloudflare API token is not configured. Please set the CLOUDFLARE_API_TOKEN in your Supabase secrets.';
      } else if (error.message?.includes('Unauthorized')) {
        errorMessage = 'Invalid Cloudflare API token. Please check your token permissions.';
      } else if (error.message?.includes('Forbidden')) {
        errorMessage = 'Insufficient permissions. Your API token may not have access to this zone.';
      }

      toast.error(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCloudflareData();
  }, []);

  const handleRefresh = () => {
    fetchCloudflareData(true);
  };

  if (loading) {
    return <InlineLoading />;
  }

  const { analytics, zoneInfo, securitySettings, performanceSettings } = stats;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: '#f97316' }}>
            <Cloud style={{ height: 24, width: 24, color: 'white' }} />
          </div>
          <div>
            <h2 className="font-bold" style={{ fontSize: '1.5rem' }}>
              Cloudflare Dashboard
            </h2>
            <p className="text-muted-foreground">
              Zone: {zoneInfo?.result?.name || 'Loading...'}
            </p>
          </div>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw
            style={{
              height: 16,
              width: 16,
              ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}),
            }}
          />
          Refresh
        </Button>
      </div>

      {/* Zone Status */}
      {zoneInfo && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Globe style={{ height: 20, width: 20 }} />
              Zone Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Status
                </p>
                <Badge variant={zoneInfo.result.status === 'active' ? 'default' : 'secondary'}>
                  {zoneInfo.result.status}
                </Badge>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="font-medium">
                  {zoneInfo.result.plan?.name || 'Unknown'}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Development Mode
                </p>
                <Badge variant={zoneInfo.result.development_mode > 0 ? 'destructive' : 'secondary'}>
                  {zoneInfo.result.development_mode > 0 ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Name Servers
                </p>
                <p className="text-sm">
                  {zoneInfo.result.name_servers?.length || 0} configured
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="analytics">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          {analytics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <BarChart3 style={{ height: 16, width: 16 }} />
                    Total Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {analytics.result?.totals?.requests?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {analytics.result?.totals?.requests?.cached || 0} cached
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <TrendingUp style={{ height: 16, width: 16 }} />
                    Bandwidth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {((analytics.result?.totals?.bandwidth?.all || 0) / 1024 / 1024 / 1024).toFixed(
                      2,
                    )}{' '}
                    GB
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(
                      (analytics.result?.totals?.bandwidth?.cached || 0) /
                      1024 /
                      1024 /
                      1024
                    ).toFixed(2)}{' '}
                    GB cached
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Users style={{ height: 16, width: 16 }} />
                    Unique Visitors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {analytics.result?.totals?.uniques?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Last 24 hours
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Shield style={{ height: 16, width: 16 }} />
                    Threats Blocked
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {analytics.result?.totals?.threats?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Security events
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground">Analytics data unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="security">
          {securitySettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Lock style={{ height: 20, width: 20 }} />
                    SSL/TLS Settings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <span>SSL Mode</span>
                    <Badge variant="default">
                      {securitySettings.result?.ssl?.value || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Always Use HTTPS</span>
                    <Badge
                      variant={
                        securitySettings.result?.always_use_https?.value === 'on'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {securitySettings.result?.always_use_https?.value === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Min TLS Version</span>
                    <Badge variant="outline">
                      {securitySettings.result?.min_tls_version?.value || 'Unknown'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Shield style={{ height: 20, width: 20 }} />
                    Security Level
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <span>Current Level</span>
                    <Badge variant="default">
                      {securitySettings.result?.security_level?.value || 'Unknown'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Higher security levels provide more protection but may affect legitimate traffic
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground">Security settings unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance">
          {performanceSettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Zap style={{ height: 20, width: 20 }} />
                    Caching Settings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <span>Cache Level</span>
                    <Badge variant="default">
                      {performanceSettings.result?.cache_level?.value || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Browser Cache TTL</span>
                    <Badge variant="outline">
                      {performanceSettings.result?.browser_cache_ttl?.value || 'Unknown'}s
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Development Mode</span>
                    <Badge
                      variant={
                        performanceSettings.result?.development_mode?.value === 'on'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {performanceSettings.result?.development_mode?.value === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Activity style={{ height: 20, width: 20 }} />
                    Optimization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <span>Minify CSS</span>
                    <Badge
                      variant={
                        performanceSettings.result?.minify?.value?.css === 'on'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {performanceSettings.result?.minify?.value?.css === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Minify JS</span>
                    <Badge
                      variant={
                        performanceSettings.result?.minify?.value?.js === 'on'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {performanceSettings.result?.minify?.value?.js === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Minify HTML</span>
                    <Badge
                      variant={
                        performanceSettings.result?.minify?.value?.html === 'on'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {performanceSettings.result?.minify?.value?.html === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground">Performance settings unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Cloudflare Configuration</CardTitle>
              <CardDescription>Zone: {zoneInfo?.result?.name || 'Not connected'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <h4 className="font-medium">
                    API Status
                  </h4>
                  <div className="flex items-center gap-2">
                    {stats.zoneInfo ? (
                      <>
                        <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
                        <span className="text-sm">
                          Connected
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle style={{ height: 16, width: 16, color: '#ef4444' }} />
                        <span className="text-sm">
                          Not Connected
                        </span>
                      </>
                    )}
                  </div>
                  {!stats.zoneInfo && (
                    <div
                      className="mt-4 p-4 rounded-lg"
                      style={{ backgroundColor: '#fefce8', border: '1px solid #fde047' }}
                    >
                      <h5 className="font-medium mb-2" style={{ color: '#854d0e' }}>
                        Setup Required
                      </h5>
                      <p className="text-sm mb-3" style={{ color: '#a16207' }}>
                        To use the Cloudflare dashboard, configure the following Supabase secrets:
                      </p>
                      <ol
                        className="text-sm flex flex-col gap-1"
                        style={{ color: '#a16207', listStyleType: 'decimal', listStylePosition: 'inside' }}
                      >
                        <li>Go to Cloudflare Dashboard → My Profile → API Tokens</li>
                        <li>Create a token with Zone:Read permissions for your zone</li>
                        <li>
                          Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, and CLOUDFLARE_ACCOUNT_ID in
                          Supabase secrets
                        </li>
                        <li>Refresh this page</li>
                      </ol>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="font-medium">
                    Last Updated
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date().toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

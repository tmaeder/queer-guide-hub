import { useState, useEffect } from 'react';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  cloudflareAPI,
  type CloudflareAnalytics,
  type CloudflareZoneInfo,
  type CloudflareSecuritySettings,
  type CloudflarePerformanceSettings,
} from '@/integrations/supabase/cloudflare';
import { InlineLoading } from '@/components/ui/loading';
import {
  Cloud,
  Shield,
  Zap,
  BarChart3,
  Globe,
  Lock,
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
  errors?: Partial<
    Record<'analytics' | 'zoneInfo' | 'securitySettings' | 'performanceSettings', string>
  >;
  updatedAt?: Date;
}

export function CloudflareDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<CloudflareStats>({});

  const fetchCloudflareData = async (showRefreshToast = false) => {
    try {
      if (showRefreshToast) setRefreshing(true);

      const results = await Promise.allSettled([
        cloudflareAPI.getAnalytics(),
        cloudflareAPI.getZoneInfo(),
        cloudflareAPI.getSecuritySettings(),
        cloudflareAPI.getPerformanceSettings(),
      ]);
      const keys = ['analytics', 'zoneInfo', 'securitySettings', 'performanceSettings'] as const;
      const errors: NonNullable<CloudflareStats['errors']> = {};
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          errors[keys[index]] =
            result.reason instanceof Error ? result.reason.message : 'Request failed';
        }
      });
      const [analytics, zoneInfo, securitySettings, performanceSettings] = results;
      setStats({
        analytics: analytics.status === 'fulfilled' ? analytics.value : null,
        zoneInfo: zoneInfo.status === 'fulfilled' ? zoneInfo.value : null,
        securitySettings: securitySettings.status === 'fulfilled' ? securitySettings.value : null,
        performanceSettings:
          performanceSettings.status === 'fulfilled' ? performanceSettings.value : null,
        errors,
        updatedAt: results.some((result) => result.status === 'fulfilled') ? new Date() : undefined,
      });
      if (showRefreshToast) {
        if (Object.keys(errors).length) {
          toast.error('Cloudflare refresh incomplete. See the errors below.');
        } else {
          toast.success('Cloudflare data refreshed.');
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch Cloudflare data';
      setStats({ errors: { zoneInfo: message } });
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
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
      {/* Was <h2 className="font-bold text-headline"> — an h2 as the page
        title, so this route had no h1. The zone name is record IDENTITY, so it
        moves to the filter row rather than staying as prose. */}
      <AdminArchetypeHeader
        className="mb-0"
        title={
          <span className="flex items-center gap-4">
            <Cloud size={24} aria-hidden />
            Cloudflare
          </span>
        }
        filters={
          <span className="text-13 text-muted-foreground">
            {/* An em dash, not "Loading...": this is a fallback VALUE for a
              field, and the repo renders unknown values as —. */}
            Zone: {zoneInfo?.result?.name || '—'}
          </span>
        }
        actions={
          <Button onClick={handleRefresh} disabled={refreshing} loading={refreshing}>
            <RefreshCw size={16} />
            Refresh
          </Button>
        }
      />

      {stats.errors && Object.keys(stats.errors).length > 0 && (
        <Card role="alert">
          <CardHeader>
            <CardTitle>Some Cloudflare data could not be loaded</CardTitle>
            <CardDescription>
              Available sections are shown below. Refresh to retry failed requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm [overflow-wrap:anywhere]">
              {Object.entries(stats.errors).map(([section, message]) => (
                <li key={section}>
                  <strong>
                    {
                      (
                        {
                          zoneInfo: 'Connection',
                          analytics: 'Analytics',
                          securitySettings: 'Security',
                          performanceSettings: 'Performance',
                        } as Record<string, string>
                      )[section]
                    }
                    :
                  </strong>{' '}
                  {message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Zone Status */}
      {zoneInfo && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Globe size={20} />
              Zone Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={zoneInfo.result.status === 'active' ? 'default' : 'secondary'}>
                  {zoneInfo.result.status}
                </Badge>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="font-medium">{zoneInfo.result.plan?.name || 'Unknown'}</p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Development Mode</p>
                <Badge variant={zoneInfo.result.development_mode > 0 ? 'destructive' : 'secondary'}>
                  {zoneInfo.result.development_mode > 0 ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Name Servers</p>
                <p className="text-sm">{zoneInfo.result.name_servers?.length || 0} configured</p>
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
                    <BarChart3 size={16} />
                    Total Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-headline font-bold">
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
                    <TrendingUp size={16} />
                    Bandwidth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-headline font-bold">
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
                    <Users size={16} />
                    Unique Visitors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-headline font-bold">
                    {analytics.result?.totals?.uniques?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Last 24 hours</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    <Shield size={16} />
                    Threats Blocked
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-headline font-bold">
                    {analytics.result?.totals?.threats?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Security events</p>
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
                    <Lock size={20} />
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
                    <Shield size={20} />
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
                    <Zap size={20} />
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
                      {performanceSettings.result?.browser_cache_ttl?.value != null
                        ? `${performanceSettings.result.browser_cache_ttl.value}s`
                        : 'Unknown'}
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
                  <h4 className="font-medium">API Status</h4>
                  <div className="flex items-center gap-2">
                    {stats.zoneInfo ? (
                      <>
                        <CheckCircle size={16} className="text-foreground" />
                        <span className="text-sm">Connected</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={16} className="text-destructive" />
                        <span className="text-sm">Not Connected</span>
                      </>
                    )}
                  </div>
                  {stats.errors?.zoneInfo?.includes('not configured') && (
                    <div
                      className="mt-4 p-4 rounded-element"
                      style={{
                        backgroundColor: 'hsl(var(--muted))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    >
                      <h5
                        className="font-medium mb-2"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        Setup Required
                      </h5>
                      <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        To use the Cloudflare dashboard, configure the following Supabase secrets:
                      </p>
                      <ol
                        className="text-sm flex flex-col gap-1 break-words"
                        style={{
                          color: 'hsl(var(--muted-foreground))',
                          listStyleType: 'decimal',
                          listStylePosition: 'inside',
                        }}
                      >
                        <li>Go to Cloudflare Dashboard → My Profile → API Tokens</li>
                        <li>
                          Use a token scoped to your zone with Zone, Zone Settings, and Analytics
                          read permissions
                        </li>
                        <li>Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in Supabase secrets</li>
                        <li>Refresh this page</li>
                      </ol>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="font-medium">Last Updated</h4>
                  <p className="text-sm text-muted-foreground">
                    {stats.updatedAt?.toLocaleString() || '—'}
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

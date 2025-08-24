import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cloudflareAPI } from '@/integrations/supabase/cloudflare'
import { InlineLoading } from '@/components/ui/loading'
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
  RefreshCw
} from 'lucide-react'

interface CloudflareStats {
  analytics?: any
  zoneInfo?: any
  securitySettings?: any
  performanceSettings?: any
  threatAnalytics?: any
}

export function CloudflareDashboard() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState<CloudflareStats>({})
  const { toast } = useToast()

  const fetchCloudflareData = async (showRefreshToast = false) => {
    try {
      if (showRefreshToast) setRefreshing(true)
      
      // First test if the API token is configured
      const testResult = await cloudflareAPI.getZoneInfo()
      
      const [analytics, zoneInfo, securitySettings, performanceSettings, threatAnalytics] = await Promise.allSettled([
        cloudflareAPI.getAnalytics(),
        Promise.resolve(testResult), // Use the already fetched zone info
        cloudflareAPI.getSecuritySettings(),
        cloudflareAPI.getPerformanceSettings(),
        cloudflareAPI.getThreatAnalytics()
      ])

      setStats({
        analytics: analytics.status === 'fulfilled' ? analytics.value : null,
        zoneInfo: zoneInfo.status === 'fulfilled' ? zoneInfo.value : null,
        securitySettings: securitySettings.status === 'fulfilled' ? securitySettings.value : null,
        performanceSettings: performanceSettings.status === 'fulfilled' ? performanceSettings.value : null,
        threatAnalytics: threatAnalytics.status === 'fulfilled' ? threatAnalytics.value : null
      })

      if (showRefreshToast) {
        toast({
          title: "Cloudflare Data Refreshed",
          description: "Latest statistics have been loaded successfully."
        })
      }
    } catch (error: any) {
      console.error('Error fetching Cloudflare data:', error)
      
      let errorMessage = "Failed to fetch Cloudflare data."
      
      if (error.message?.includes('API token not configured')) {
        errorMessage = "Cloudflare API token is not configured. Please set the CLOUDFLARE_API_TOKEN in your Supabase secrets."
      } else if (error.message?.includes('Unauthorized')) {
        errorMessage = "Invalid Cloudflare API token. Please check your token permissions."
      } else if (error.message?.includes('Forbidden')) {
        errorMessage = "Insufficient permissions. Your API token may not have access to this zone."
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchCloudflareData()
  }, [])

  const handleRefresh = () => {
    fetchCloudflareData(true)
  }

  if (loading) {
    return <InlineLoading />
  }

  const { analytics, zoneInfo, securitySettings, performanceSettings } = stats

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500 rounded-lg">
            <Cloud className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Cloudflare Dashboard</h2>
            <p className="text-muted-foreground">Zone: {zoneInfo?.result?.name || 'Loading...'}</p>
          </div>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Zone Status */}
      {zoneInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Zone Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={zoneInfo.result.status === 'active' ? 'default' : 'secondary'}>
                  {zoneInfo.result.status}
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="font-medium">{zoneInfo.result.plan?.name || 'Unknown'}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Development Mode</p>
                <Badge variant={zoneInfo.result.development_mode > 0 ? 'destructive' : 'secondary'}>
                  {zoneInfo.result.development_mode > 0 ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Name Servers</p>
                <p className="text-sm">{zoneInfo.result.name_servers?.length || 0} configured</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          {analytics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Total Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics.result?.totals?.requests?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {analytics.result?.totals?.requests?.cached || 0} cached
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Bandwidth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {((analytics.result?.totals?.bandwidth?.all || 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {((analytics.result?.totals?.bandwidth?.cached || 0) / 1024 / 1024 / 1024).toFixed(2)} GB cached
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Unique Visitors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics.result?.totals?.uniques?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Last 24 hours</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Threats Blocked
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics.result?.totals?.threats?.all?.toLocaleString() || '0'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Security events</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Analytics data unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          {securitySettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    SSL/TLS Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>SSL Mode</span>
                    <Badge variant="default">
                      {securitySettings.result?.ssl?.value || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Always Use HTTPS</span>
                    <Badge variant={securitySettings.result?.always_use_https?.value === 'on' ? 'default' : 'secondary'}>
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
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
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
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Security settings unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {performanceSettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Caching Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                    <Badge variant={performanceSettings.result?.development_mode?.value === 'on' ? 'destructive' : 'secondary'}>
                      {performanceSettings.result?.development_mode?.value === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Optimization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Minify CSS</span>
                    <Badge variant={performanceSettings.result?.minify?.value?.css === 'on' ? 'default' : 'secondary'}>
                      {performanceSettings.result?.minify?.value?.css === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Minify JS</span>
                    <Badge variant={performanceSettings.result?.minify?.value?.js === 'on' ? 'default' : 'secondary'}>
                      {performanceSettings.result?.minify?.value?.js === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Minify HTML</span>
                    <Badge variant={performanceSettings.result?.minify?.value?.html === 'on' ? 'default' : 'secondary'}>
                      {performanceSettings.result?.minify?.value?.html === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Performance settings unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cloudflare Configuration</CardTitle>
              <CardDescription>
                Zone ID: fe9b9da8a08af32e10bb3ba7fdb04440<br />
                Account ID: 7aa3765cc5f50f2b681b782eb4a8d296
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="font-medium">API Status</h4>
                  <div className="flex items-center gap-2">
                    {stats.zoneInfo ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm">Connected</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">Not Connected</span>
                      </>
                    )}
                  </div>
                  {!stats.zoneInfo && (
                    <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <h5 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Setup Required</h5>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                        To use the Cloudflare dashboard, you need to set your Cloudflare API token in Supabase secrets.
                      </p>
                      <ol className="text-sm text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-1">
                        <li>Go to Cloudflare Dashboard → My Profile → API Tokens</li>
                        <li>Create a token with Zone:Read permissions for your zone</li>
                        <li>Add it as CLOUDFLARE_API_TOKEN in Supabase secrets</li>
                        <li>Refresh this page</li>
                      </ol>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Last Updated</h4>
                  <p className="text-sm text-muted-foreground">{new Date().toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
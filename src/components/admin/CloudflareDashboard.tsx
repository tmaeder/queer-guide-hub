import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ p: 1, bgcolor: '#f97316', borderRadius: 2 }}>
            <Cloud style={{ height: 24, width: 24, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>Cloudflare Dashboard</Typography>
            <p style={{ color: 'var(--muted-foreground)' }}>Zone: {zoneInfo?.result?.name || 'Loading...'}</p>
          </Box>
        </Box>
        <Button onClick={handleRefresh} disabled={refreshing} sx={{ gap: 1 }}>
          <RefreshCw style={{ height: 16, width: 16, ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </Button>
      </Box>

      {/* Zone Status */}
      {zoneInfo && (
        <Card>
          <CardHeader>
            <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Globe style={{ height: 20, width: 20 }} />
              Zone Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Status</Typography>
                <Badge variant={zoneInfo.result.status === 'active' ? 'default' : 'secondary'}>
                  {zoneInfo.result.status}
                </Badge>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Plan</Typography>
                <Typography sx={{ fontWeight: 500 }}>{zoneInfo.result.plan?.name || 'Unknown'}</Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Development Mode</Typography>
                <Badge variant={zoneInfo.result.development_mode > 0 ? 'destructive' : 'secondary'}>
                  {zoneInfo.result.development_mode > 0 ? 'ON' : 'OFF'}
                </Badge>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Name Servers</Typography>
                <Typography sx={{ fontSize: '0.875rem' }}>{zoneInfo.result.name_servers?.length || 0} configured</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="analytics" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {analytics ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
              <Card>
                <CardHeader sx={{ pb: 1.5 }}>
                  <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BarChart3 style={{ height: 16, width: 16 }} />
                    Total Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {analytics.result?.totals?.requests?.all?.toLocaleString() || '0'}
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>
                    {analytics.result?.totals?.requests?.cached || 0} cached
                  </Typography>
                </CardContent>
              </Card>

              <Card>
                <CardHeader sx={{ pb: 1.5 }}>
                  <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp style={{ height: 16, width: 16 }} />
                    Bandwidth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {((analytics.result?.totals?.bandwidth?.all || 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>
                    {((analytics.result?.totals?.bandwidth?.cached || 0) / 1024 / 1024 / 1024).toFixed(2)} GB cached
                  </Typography>
                </CardContent>
              </Card>

              <Card>
                <CardHeader sx={{ pb: 1.5 }}>
                  <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Users style={{ height: 16, width: 16 }} />
                    Unique Visitors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {analytics.result?.totals?.uniques?.all?.toLocaleString() || '0'}
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>Last 24 hours</Typography>
                </CardContent>
              </Card>

              <Card>
                <CardHeader sx={{ pb: 1.5 }}>
                  <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Shield style={{ height: 16, width: 16 }} />
                    Threats Blocked
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {analytics.result?.totals?.threats?.all?.toLocaleString() || '0'}
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>Security events</Typography>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card>
              <CardContent sx={{ py: 4, textAlign: 'center' }}>
                <p style={{ color: 'var(--muted-foreground)' }}>Analytics data unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="security" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {securitySettings ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              <Card>
                <CardHeader>
                  <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Lock style={{ height: 20, width: 20 }} />
                    SSL/TLS Settings
                  </CardTitle>
                </CardHeader>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SSL Mode</span>
                    <Badge variant="default">
                      {securitySettings.result?.ssl?.value || 'Unknown'}
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Always Use HTTPS</span>
                    <Badge variant={securitySettings.result?.always_use_https?.value === 'on' ? 'default' : 'secondary'}>
                      {securitySettings.result?.always_use_https?.value === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Min TLS Version</span>
                    <Badge variant="outline">
                      {securitySettings.result?.min_tls_version?.value || 'Unknown'}
                    </Badge>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Shield style={{ height: 20, width: 20 }} />
                    Security Level
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Current Level</span>
                    <Badge variant="default">
                      {securitySettings.result?.security_level?.value || 'Unknown'}
                    </Badge>
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 1 }}>
                    Higher security levels provide more protection but may affect legitimate traffic
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card>
              <CardContent sx={{ py: 4, textAlign: 'center' }}>
                <p style={{ color: 'var(--muted-foreground)' }}>Security settings unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {performanceSettings ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              <Card>
                <CardHeader>
                  <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Zap style={{ height: 20, width: 20 }} />
                    Caching Settings
                  </CardTitle>
                </CardHeader>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Cache Level</span>
                    <Badge variant="default">
                      {performanceSettings.result?.cache_level?.value || 'Unknown'}
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Browser Cache TTL</span>
                    <Badge variant="outline">
                      {performanceSettings.result?.browser_cache_ttl?.value || 'Unknown'}s
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Development Mode</span>
                    <Badge variant={performanceSettings.result?.development_mode?.value === 'on' ? 'destructive' : 'secondary'}>
                      {performanceSettings.result?.development_mode?.value === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </Box>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Activity style={{ height: 20, width: 20 }} />
                    Optimization
                  </CardTitle>
                </CardHeader>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Minify CSS</span>
                    <Badge variant={performanceSettings.result?.minify?.value?.css === 'on' ? 'default' : 'secondary'}>
                      {performanceSettings.result?.minify?.value?.css === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Minify JS</span>
                    <Badge variant={performanceSettings.result?.minify?.value?.js === 'on' ? 'default' : 'secondary'}>
                      {performanceSettings.result?.minify?.value?.js === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Minify HTML</span>
                    <Badge variant={performanceSettings.result?.minify?.value?.html === 'on' ? 'default' : 'secondary'}>
                      {performanceSettings.result?.minify?.value?.html === 'on' ? 'ON' : 'OFF'}
                    </Badge>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Card>
              <CardContent sx={{ py: 4, textAlign: 'center' }}>
                <p style={{ color: 'var(--muted-foreground)' }}>Performance settings unavailable</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle>Cloudflare Configuration</CardTitle>
              <CardDescription>
                Zone ID: fe9b9da8a08af32e10bb3ba7fdb04440<br />
                Account ID: 7aa3765cc5f50f2b681b782eb4a8d296
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="h4" sx={{ fontWeight: 500 }}>API Status</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {stats.zoneInfo ? (
                      <>
                        <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
                        <Box component="span" sx={{ fontSize: '0.875rem' }}>Connected</Box>
                      </>
                    ) : (
                      <>
                        <AlertTriangle style={{ height: 16, width: 16, color: '#ef4444' }} />
                        <Box component="span" sx={{ fontSize: '0.875rem' }}>Not Connected</Box>
                      </>
                    )}
                  </Box>
                  {!stats.zoneInfo && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: '#fefce8', border: 1, borderColor: '#fde047', borderRadius: 2 }}>
                      <Typography variant="h5" sx={{ fontWeight: 500, color: '#854d0e', mb: 1 }}>Setup Required</Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: '#a16207', mb: 1.5 }}>
                        To use the Cloudflare dashboard, you need to set your Cloudflare API token in Supabase secrets.
                      </Typography>
                      <Box component="ol" sx={{ fontSize: '0.875rem', color: '#a16207', listStyleType: 'decimal', listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <li>Go to Cloudflare Dashboard &rarr; My Profile &rarr; API Tokens</li>
                        <li>Create a token with Zone:Read permissions for your zone</li>
                        <li>Add it as CLOUDFLARE_API_TOKEN in Supabase secrets</li>
                        <li>Refresh this page</li>
                      </Box>
                    </Box>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="h4" sx={{ fontWeight: 500 }}>Last Updated</Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{new Date().toLocaleString()}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Box>
  )
}
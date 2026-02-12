import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, CheckCircle, Eye, Lock, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SecurityEvent {
  id: string;
  event_type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  details?: any;
  metadata?: any;
  created_at: string;
  user_id?: string;
}

interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  recentAdminAccess: number;
  failedLogins: number;
}

export function SecurityDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalEvents: 0,
    criticalEvents: 0,
    recentAdminAccess: 0,
    failedLogins: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      loadSecurityData();
    }
  }, [isAdmin]);

  const loadSecurityData = async () => {
    if (!isAdmin) return;

    try {
      setLoading(true);

      // Load recent security events
      const { data: eventsData } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsData) {
        setEvents(eventsData);

        // Calculate metrics
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const recentEvents = eventsData.filter(e => new Date(e.created_at) > last24h);
        const criticalEvents = recentEvents.filter(e => {
          // Extract severity from metadata if available
          const severity = (e.metadata as any)?.severity || 'unknown';
          return severity === 'critical';
        });
        const adminAccess = recentEvents.filter(e =>
          e.event_type.includes('ADMIN_') || e.event_type.includes('PRIVACY_OVERRIDE')
        );

        setMetrics({
          totalEvents: recentEvents.length,
          criticalEvents: criticalEvents.length,
          recentAdminAccess: adminAccess.length,
          failedLogins: recentEvents.filter(e => e.event_type.includes('FAILED_LOGIN')).length
        });
      }
    } catch (error) {
      console.error('Failed to load security data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle style={{ height: 16, width: 16 }} />
        <AlertDescription>
          Access denied. This dashboard is only available to administrators.
        </AlertDescription>
      </Alert>
    );
  }

  const getSeverityBadge = (severity?: string) => {
    const variants = {
      low: 'secondary',
      medium: 'default',
      high: 'destructive',
      critical: 'destructive'
    } as const;

    return (
      <Badge variant={variants[severity as keyof typeof variants] || 'secondary'}>
        {(severity || 'unknown').toUpperCase()}
      </Badge>
    );
  };

  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle style={{ height: 16, width: 16, color: '#ef4444' }} />;
      case 'medium':
        return <Eye style={{ height: 16, width: 16, color: '#eab308' }} />;
      default:
        return <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Shield style={{ height: 24, width: 24 }} />
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Security Dashboard</Typography>
        </Box>
        <Button onClick={loadSecurityData} disabled={loading}>
          <RefreshCw style={{ height: 16, width: 16, marginRight: 8, ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </Button>
      </Box>

      {/* Security Metrics */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Events (24h)</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{metrics.totalEvents}</Typography>
              </Box>
              <Eye style={{ height: 32, width: 32, color: '#3b82f6' }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Critical Events</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'error.main' }}>{metrics.criticalEvents}</Typography>
              </Box>
              <AlertTriangle style={{ height: 32, width: 32, color: '#ef4444' }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Admin Access</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{metrics.recentAdminAccess}</Typography>
              </Box>
              <Lock style={{ height: 32, width: 32, color: '#555555' }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Failed Logins</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{metrics.failedLogins}</Typography>
              </Box>
              <AlertTriangle style={{ height: 32, width: 32, color: '#f97316' }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Security Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {events.slice(0, 20).map((event) => (
              <Box key={event.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                {getSeverityIcon(event.severity)}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography component="span" sx={{ fontWeight: 500 }}>{event.event_type}</Typography>
                    {getSeverityBadge(event.severity)}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(event.created_at).toLocaleString()}
                  </Typography>
                  {(event.details || event.metadata) && (
                    <Box
                      component="pre"
                      sx={{ fontSize: '0.75rem', mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, overflowX: 'auto' }}
                    >
                      {JSON.stringify(event.details || event.metadata, null, 2)}
                    </Box>
                  )}
                </Box>
              </Box>
            ))}

            {events.length === 0 && !loading && (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                No security events found
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Security Status */}
      <Card>
        <CardHeader>
          <CardTitle>Security Implementation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Typography component="span">Profile data encryption and RLS policies hardened</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Typography component="span">Location privacy lockdown implemented</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Typography component="span">Financial data security enhanced</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Typography component="span">Credential storage security implemented</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Typography component="span">Content sanitization enhanced</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Typography component="span">Admin access logging and monitoring active</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

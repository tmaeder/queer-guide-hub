import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, CheckCircle, Eye, Lock, RefreshCw } from 'lucide-react';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { listFrom } from '@/hooks/usePageFetchers';

interface SecurityEvent {
  id: string;
  event_type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  const { isAdmin } = useAdminRoles();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalEvents: 0,
    criticalEvents: 0,
    recentAdminAccess: 0,
    failedLogins: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      loadSecurityData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSecurityData defined below, re-run on isAdmin change
  }, [isAdmin]);

  const loadSecurityData = async () => {
    if (!isAdmin) return;

    try {
      setLoading(true);

      const eventsData = await listFrom<SecurityEvent>(
        'security_events',
        '*',
        { col: 'created_at', ascending: false },
        50,
      );

      if (eventsData) {
        setEvents(eventsData);

        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const recentEvents = eventsData.filter((e) => new Date(e.created_at) > last24h);
        const criticalEvents = recentEvents.filter((e) => {
          const severity =
            (e.metadata as Record<string, unknown> | undefined)?.severity || 'unknown';
          return severity === 'critical';
        });
        const adminAccess = recentEvents.filter(
          (e) => e.event_type.includes('ADMIN_') || e.event_type.includes('PRIVACY_OVERRIDE'),
        );

        setMetrics({
          totalEvents: recentEvents.length,
          criticalEvents: criticalEvents.length,
          recentAdminAccess: adminAccess.length,
          failedLogins: recentEvents.filter((e) => e.event_type.includes('FAILED_LOGIN')).length,
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
      critical: 'destructive',
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield style={{ height: 24, width: 24 }} />
          <h2 className="text-2xl font-bold">Security Dashboard</h2>
        </div>
        <Button onClick={loadSecurityData} disabled={loading}>
          <RefreshCw
            style={{ height: 16, width: 16, marginRight: 8 }}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </Button>
      </div>

      {/* Security Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Events (24h)</p>
                <p className="text-2xl font-bold">{metrics.totalEvents}</p>
              </div>
              <Eye style={{ height: 32, width: 32, color: '#3b82f6' }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Events</p>
                <p className="text-2xl font-bold text-destructive">{metrics.criticalEvents}</p>
              </div>
              <AlertTriangle style={{ height: 32, width: 32, color: '#ef4444' }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Admin Access</p>
                <p className="text-2xl font-bold">{metrics.recentAdminAccess}</p>
              </div>
              <Lock style={{ height: 32, width: 32, color: '#555555' }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed Logins</p>
                <p className="text-2xl font-bold">{metrics.failedLogins}</p>
              </div>
              <AlertTriangle style={{ height: 32, width: 32, color: '#f97316' }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Security Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {events.slice(0, 20).map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 border border-border rounded"
              >
                {getSeverityIcon(event.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{event.event_type}</span>
                    {getSeverityBadge(event.severity)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                  {(event.details || event.metadata) && (
                    <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-x-auto">
                      {JSON.stringify(event.details || event.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}

            {events.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                No security events found
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Status */}
      <Card>
        <CardHeader>
          <CardTitle>Security Implementation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span>Profile data encryption and RLS policies hardened</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span>Location privacy lockdown implemented</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span>Financial data security enhanced</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span>Credential storage security implemented</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span>Content sanitization enhanced</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span>Admin access logging and monitoring active</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

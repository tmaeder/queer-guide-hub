import { useQuery } from '@tanstack/react-query';
import { listFrom, countRows } from '@/hooks/usePageFetchers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Activity, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SecurityEvent {
  id: string;
  user_id: string | null;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export function SecurityMonitoringDashboard() {
  const { data: recentEvents = [], isLoading } = useQuery({
    queryKey: ['security-events'],
    queryFn: () =>
      listFrom<SecurityEvent>('security_events', '*', { col: 'created_at', ascending: false }, 50),
    refetchInterval: 30000,
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () =>
      listFrom<unknown>(
        'user_role_audit_log',
        'id, admin_user_id, target_user_id, action, role_name, timestamp',
        { col: 'timestamp', ascending: false },
        20,
      ),
  });

  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: async () => {
      const [totalFailedLogins, totalCaptchaVerifications, totalAccessLogs] = await Promise.all([
        countRows('failed_login_attempts'),
        countRows('captcha_verifications'),
        countRows('access_logs'),
      ]);
      return { totalFailedLogins, totalCaptchaVerifications, totalAccessLogs };
    },
  });

  const { data: recentFailedLogins = [] } = useQuery({
    queryKey: ['recent-failed-logins'],
    queryFn: () =>
      listFrom<unknown>(
        'failed_login_attempts',
        '*',
        { col: 'created_at', ascending: false },
        10,
      ),
  });

  const getSeverityColor = (severity: string): 'destructive' | 'secondary' | 'default' => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
      case 'info':
      default:
        return 'default';
    }
  };

  const getEventIcon = (eventType: string) => {
    if (eventType.includes('ROLE') || eventType.includes('ESCALATION')) {
      return <Users style={{ height: 16, width: 16 }} />;
    }
    if (eventType.includes('RATE_LIMIT') || eventType.includes('XSS')) {
      return <AlertTriangle style={{ height: 16, width: 16 }} />;
    }
    return <Activity style={{ height: 16, width: 16 }} />;
  };

  const criticalEvents = recentEvents.filter(
    (e) =>
      (e.details as { severity?: string })?.severity === 'high' ||
      e.event_type.includes('XSS') ||
      e.event_type.includes('ESCALATION'),
  );

  if (isLoading) {
    return <div>Loading security dashboard...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Shield style={{ height: 24, width: 24 }} />
        <h2 className="text-2xl font-bold">Security Monitoring Dashboard</h2>
      </div>

      {criticalEvents.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertDescription>
            {criticalEvents.length} critical security event(s) detected. Review immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* System Statistics Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-element">
              <Activity style={{ height: 16, width: 16 }} />
            </div>
            <div>
              <p className="text-sm font-medium">Total Security Events</p>
              <p className="text-2xl font-bold">{recentEvents.length}</p>
              <p className="text-xs text-muted-foreground">Last 50 events</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-element" style={{ backgroundColor: 'rgba(var(--destructive-rgb), 0.1)' }}>
              <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
            </div>
            <div>
              <p className="text-sm font-medium">Failed Login Attempts</p>
              <p className="text-2xl font-bold">{systemStats?.totalFailedLogins || 0}</p>
              <p className="text-xs text-muted-foreground">Total recorded</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-element" style={{ backgroundColor: 'rgba(var(--success-rgb), 0.1)' }}>
              <Shield style={{ height: 16, width: 16, color: 'var(--success)' }} />
            </div>
            <div>
              <p className="text-sm font-medium">CAPTCHA Verifications</p>
              <p className="text-2xl font-bold">{systemStats?.totalCaptchaVerifications || 0}</p>
              <p className="text-xs text-muted-foreground">Total completed</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recent Security Events</CardTitle>
            <CardDescription>Latest security events and system alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
              {recentEvents.slice(0, 10).map((event) => {
                const det = event.details as { severity?: string } | undefined;
                return (
                <div key={event.id} className="flex items-start gap-3 p-3 border border-border rounded-element">
                  <div className="mt-1">{getEventIcon(event.event_type)}</div>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{event.event_type.replace(/_/g, ' ')}</span>
                      <Badge variant={getSeverityColor(det?.severity || 'info')}>
                        {det?.severity || 'info'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </p>
                    {event.details && Object.keys(event.details).length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">View details</summary>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
                );
              })}
              {recentEvents.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No recent security events</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Management Audit</CardTitle>
            <CardDescription>Recent role assignments and changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
              {auditLogs.map((log: Record<string, unknown>) => (
                <div key={log.id as string} className="flex items-start gap-3 p-3 border border-border rounded-element">
                  <Users style={{ height: 16, width: 16, marginTop: 4 }} />
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        Role {log.action as string}: {log.role_name as string}
                      </span>
                      <Badge variant="outline">{log.action as string}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Admin: {(log.admin_user_id as string)?.slice(0, 8)}... → Target:{' '}
                      {(log.target_user_id as string)?.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.timestamp as string), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No recent role changes</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed Login Attempts</CardTitle>
            <CardDescription>Recent failed authentication attempts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
              {recentFailedLogins.map((attempt: Record<string, unknown>) => (
                <div key={attempt.id as string} className="flex items-start gap-3 p-3 border border-border rounded-element">
                  <AlertTriangle style={{ height: 16, width: 16, marginTop: 4, color: 'var(--destructive)' }} />
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{(attempt.attempt_type as string).toUpperCase()} Failed</span>
                      <Badge variant="destructive">Failed</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">IP: {attempt.ip_address as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(attempt.created_at as string), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {recentFailedLogins.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No recent failed login attempts</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

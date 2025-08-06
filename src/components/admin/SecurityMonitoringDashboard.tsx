import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Activity, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SecurityEvent {
  id: string;
  user_id: string | null;
  event_type: string;
  details: any;
  created_at: string;
}

export function SecurityMonitoringDashboard() {
  const { data: recentEvents = [], isLoading } = useQuery({
    queryKey: ['security-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as SecurityEvent[];
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_role_audit_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    }
  });

  // Get additional system metrics
  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: async () => {
      const [accessLogs, failedLogins, captchaVerifications] = await Promise.all([
        supabase.from('access_logs').select('*', { count: 'exact', head: true }),
        supabase.from('failed_login_attempts').select('*', { count: 'exact', head: true }),
        supabase.from('captcha_verifications').select('*', { count: 'exact', head: true })
      ]);
      
      return {
        totalAccessLogs: accessLogs.count || 0,
        totalFailedLogins: failedLogins.count || 0,
        totalCaptchaVerifications: captchaVerifications.count || 0
      };
    }
  });

  const getSeverityColor = (severity: string) => {
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
      return <Users className="h-4 w-4" />;
    }
    if (eventType.includes('RATE_LIMIT') || eventType.includes('XSS')) {
      return <AlertTriangle className="h-4 w-4" />;
    }
    return <Activity className="h-4 w-4" />;
  };

  const criticalEvents = recentEvents.filter(e => 
    e.details?.severity === 'high' || 
    e.event_type.includes('XSS') || 
    e.event_type.includes('ESCALATION')
  );

  if (isLoading) {
    return <div>Loading security dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Security Monitoring Dashboard</h2>
      </div>

      {criticalEvents.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {criticalEvents.length} critical security event(s) detected. Review immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* System Statistics Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Total Security Events</p>
              <p className="text-2xl font-bold">{recentEvents.length}</p>
              <p className="text-xs text-muted-foreground">Last 50 events</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Failed Login Attempts</p>
              <p className="text-2xl font-bold">{systemStats?.totalFailedLogins || 0}</p>
              <p className="text-xs text-muted-foreground">Total recorded</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
              <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium">CAPTCHA Verifications</p>
              <p className="text-2xl font-bold">{systemStats?.totalCaptchaVerifications || 0}</p>
              <p className="text-xs text-muted-foreground">Total completed</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Security Events</CardTitle>
            <CardDescription>
              Latest security events and system alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentEvents.slice(0, 20).map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="mt-1">
                    {getEventIcon(event.event_type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {event.event_type.replace(/_/g, ' ')}
                      </span>
                      <Badge variant={getSeverityColor(event.details?.severity || 'info')}>
                        {event.details?.severity || 'info'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </p>
                    {event.details && Object.keys(event.details).length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          View details
                        </summary>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              {recentEvents.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  No recent security events
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Management Audit</CardTitle>
            <CardDescription>
              Recent role assignments and changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <Users className="h-4 w-4 mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        Role {log.action_type}: {log.role_changed}
                      </span>
                      <Badge variant="outline">
                        {log.action_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Admin: {log.admin_user_id} → Target: {log.target_user_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  No recent role changes
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
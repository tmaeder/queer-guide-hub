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

      if (error) {
        console.error('Error fetching security events:', error);
        throw error;
      }
      console.log('Security events fetched:', data?.length || 0);
      return data as SecurityEvent[];
    },
    refetchInterval: 30000
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

  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: async () => {
      const [failedLogins, captchaVerifications, accessLogs] = await Promise.all([
        supabase.from('failed_login_attempts').select('*', { count: 'exact', head: true }),
        supabase.from('captcha_verifications').select('*', { count: 'exact', head: true }),
        supabase.from('access_logs').select('*', { count: 'exact', head: true })
      ]);
      
      return {
        totalFailedLogins: failedLogins.count || 0,
        totalCaptchaVerifications: captchaVerifications.count || 0,
        totalAccessLogs: accessLogs.count || 0
      };
    }
  });

  const { data: recentFailedLogins = [] } = useQuery({
    queryKey: ['recent-failed-logins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('failed_login_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
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
      return <Users style={{ height: 16, width: 16 }} />;
    }
    if (eventType.includes('RATE_LIMIT') || eventType.includes('XSS')) {
      return <AlertTriangle style={{ height: 16, width: 16 }} />;
    }
    return <Activity style={{ height: 16, width: 16 }} />;
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
    <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Shield style={{ height: 24, width: 24 }} />
        <h2 sx={{ fontSize: '1.5rem', fontWeight: 700 }}>Security Monitoring Dashboard</h2>
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
      <div sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: 'repeat(3, 1fr)' } }}>
        <Card sx={{ p: 2 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <div sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Activity style={{ height: 16, width: 16, color: 'var(--foreground)' }} />
            </div>
            <div>
              <p sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Security Events</p>
              <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{recentEvents.length}</p>
              <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Last 50 events</p>
            </div>
          </div>
        </Card>

        <Card sx={{ p: 2 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <div sx={{ p: 1, bgcolor: 'rgba(var(--destructive-rgb), 0.1)', borderRadius: 2 }}>
              <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
            </div>
            <div>
              <p sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Failed Login Attempts</p>
              <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{systemStats?.totalFailedLogins || 0}</p>
              <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Total recorded</p>
            </div>
          </div>
        </Card>

        <Card sx={{ p: 2 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <div sx={{ p: 1, bgcolor: 'rgba(var(--success-rgb), 0.1)', borderRadius: 2 }}>
              <Shield style={{ height: 16, width: 16, color: 'var(--success)' }} />
            </div>
            <div>
              <p sx={{ fontSize: '0.875rem', fontWeight: 500 }}>CAPTCHA Verifications</p>
              <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{systemStats?.totalCaptchaVerifications || 0}</p>
              <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Total completed</p>
            </div>
          </div>
        </Card>
      </div>

      <div sx={{ display: 'grid', gap: 3, gridTemplateColumns: { md: 'repeat(3, 1fr)' } }}>
        <Card>
          <CardHeader>
            <CardTitle>Recent Security Events</CardTitle>
            <CardDescription>
              Latest security events and system alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 384, overflowY: 'auto' }}>
              {recentEvents.slice(0, 10).map((event) => (
                <div key={event.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <div sx={{ mt: 0.5 }}>
                    {getEventIcon(event.event_type)}
                  </div>
                  <div sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        {event.event_type.replace(/_/g, ' ')}
                      </span>
                      <Badge variant={getSeverityColor(event.details?.severity || 'info')}>
                        {event.details?.severity || 'info'}
                      </Badge>
                    </div>
                    <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </p>
                    {event.details && Object.keys(event.details).length > 0 && (
                      <details sx={{ fontSize: '0.75rem' }}>
                        <summary sx={{ cursor: 'pointer', color: 'text.secondary' }}>
                          View details
                        </summary>
                        <pre sx={{ mt: 0.5, fontSize: '0.75rem', bgcolor: 'action.hover', p: 1, borderRadius: 1, overflowX: 'auto' }}>
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              {recentEvents.length === 0 && (
                <p sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
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
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 384, overflowY: 'auto' }}>
              {auditLogs.map((log: any) => (
                <div key={log.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Users style={{ height: 16, width: 16, marginTop: 4 }} />
                  <div sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        Role {log.action_type}: {log.role_changed}
                      </span>
                      <Badge variant="outline">
                        {log.action_type}
                      </Badge>
                    </div>
                    <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      Admin: {log.admin_user_id} → Target: {log.target_user_id}
                    </p>
                    <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                  No recent role changes
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed Login Attempts</CardTitle>
            <CardDescription>
              Recent failed authentication attempts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 384, overflowY: 'auto' }}>
              {recentFailedLogins.map((attempt: any) => (
                <div key={attempt.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <AlertTriangle style={{ height: 16, width: 16, marginTop: 4, color: 'var(--destructive)' }} />
                  <div sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        {attempt.attempt_type.toUpperCase()} Failed
                      </span>
                      <Badge variant="destructive">
                        Failed
                      </Badge>
                    </div>
                    <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      IP: {attempt.ip_address}
                    </p>
                    <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {formatDistanceToNow(new Date(attempt.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {recentFailedLogins.length === 0 && (
                <p sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                  No recent failed login attempts
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { AlertTriangle, Shield, Eye, Clock, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SecurityEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  metadata: any;
  severity: string;
  created_at: string;
}

interface SecurityStats {
  total_events: number;
  critical_events: number;
  high_events: number;
  recent_failed_logins: number;
  rate_limited_users: number;
}

export function SecurityMonitoringPanel() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAdmin) return;
    
    fetchSecurityData();
    
    // Set up real-time subscription for critical events
    const subscription = supabase
      .channel('security_events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'security_events',
        filter: 'severity=eq.critical'
      }, (payload) => {
        toast({
          title: "🚨 Critical Security Alert",
          description: `${payload.new.event_type} detected`,
          variant: "destructive",
        });
        fetchSecurityData(); // Refresh data
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [isAdmin, toast]);

  const fetchSecurityData = async () => {
    try {
      // Fetch recent security events
      const { data: eventsData, error: eventsError } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (eventsError) throw eventsError;

      // Mock security statistics since we don't have the function yet
      const mockStats: SecurityStats = {
        total_events: eventsData?.length || 0,
        critical_events: 0,
        high_events: 0,
        recent_failed_logins: 0,
        rate_limited_users: 0
      };

      setEvents((eventsData || []).map(event => ({ ...event, severity: 'medium' })) as SecurityEvent[]);
      setStats(mockStats);
    } catch (error) {
      console.error('Error fetching security data:', error);
      toast({
        title: "Error",
        description: "Failed to load security data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle style={{ height: 16, width: 16 }} />;
      case 'high': return <Shield style={{ height: 16, width: 16 }} />;
      case 'medium': return <Eye style={{ height: 16, width: 16 }} />;
      case 'low': return <Activity style={{ height: 16, width: 16 }} />;
      default: return <Clock style={{ height: 16, width: 16 }} />;
    }
  };

  const formatEventType = (eventType: string) => {
    return eventType.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle style={{ height: 16, width: 16 }} />
        <AlertDescription>
          You need administrator privileges to view security monitoring data.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <div sx={{ animation: 'spin 1s linear infinite', height: 32, width: 32, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    );
  }

  return (
    <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Security Statistics */}
      {stats && (
        <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
          <Card>
            <CardHeader sx={{ pb: 1 }}>
              <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Events (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total_events}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader sx={{ pb: 1 }}>
              <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
                Critical Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'error.main' }}>{stats.critical_events}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader sx={{ pb: 1 }}>
              <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Failed Logins</CardTitle>
            </CardHeader>
            <CardContent>
              <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.recent_failed_logins}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader sx={{ pb: 1 }}>
              <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Rate Limited</CardTitle>
            </CardHeader>
            <CardContent>
              <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.rate_limited_users}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Security Events */}
      <Card>
        <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle>Recent Security Events</CardTitle>
          <Button variant="outline" size="sm" onClick={fetchSecurityData}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>No recent security events</p>
          ) : (
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {events.map((event) => (
                <div key={event.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, bgcolor: 'rgba(var(--muted-rgb), 0.3)', borderRadius: 2 }}>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                    {getSeverityIcon(event.severity)}
                    <div sx={{ minWidth: 0, flex: 1 }}>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <span sx={{ fontWeight: 500 }}>{formatEventType(event.event_type)}</span>
                        <Badge variant={getSeverityColor(event.severity) as any}>
                          {event.severity}
                        </Badge>
                      </div>
                      <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        {formatTimestamp(event.created_at)}
                      </p>
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <details sx={{ mt: 1 }}>
                          <summary sx={{ fontSize: '0.75rem', color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}>
                            View details
                          </summary>
                          <pre sx={{ fontSize: '0.75rem', bgcolor: 'background.default', p: 1, borderRadius: 1, mt: 0.5, overflow: 'auto' }}>
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
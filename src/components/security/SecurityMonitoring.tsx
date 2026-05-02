import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

interface SecurityEvent {
  id: string;
  event_type: string;
  user_id?: string;
  ip_address?: unknown;
  user_agent?: string;
  metadata: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export function SecurityMonitoring() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecurityEvents = async () => {
    if (!user || !isAdmin) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Error fetching security events:', err);
      setError('Failed to load security events');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle style={{ height: 16, width: 16 }} />;
      case 'medium':
        return <Shield style={{ height: 16, width: 16 }} />;
      default:
        return <Activity style={{ height: 16, width: 16 }} />;
    }
  };

  useEffect(() => {
    fetchSecurityEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSecurityEvents defined above, re-run on user/isAdmin change
  }, [user, isAdmin]);

  if (!user || !isAdmin) {
    return (
      <Alert>
        <Shield style={{ height: 16, width: 16 }} />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You need administrator privileges to access security monitoring.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h5 className="text-xl font-bold tracking-tight">Security Monitoring</h5>
          <p className="text-muted-foreground">Monitor security events and potential threats</p>
        </div>
        <Button onClick={fetchSecurityEvents} disabled={loading} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {events.map((event) => (
          <Card key={event.id}>
            <CardHeader style={{ paddingBottom: 12 }}>
              <div className="flex items-center justify-between">
                <CardTitle style={{ fontSize: '1.125rem' }}>
                  <div className="flex items-center gap-2">
                    {getSeverityIcon(event.severity)}
                    {event.event_type.replace(/_/g, ' ')}
                  </div>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={getSeverityColor(event.severity)}>
                    {event.severity.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {event.user_id && (
                  <p className="text-sm">
                    <span className="font-medium">User ID:</span> {event.user_id}
                  </p>
                )}
                {event.ip_address && (
                  <p className="text-sm">
                    <span className="font-medium">IP Address:</span> {String(event.ip_address)}
                  </p>
                )}
                {Object.keys(event.metadata).length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">Details:</span>
                    <pre className="mt-1 text-xs bg-muted p-2 overflow-x-auto">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {events.length === 0 && !loading && (
          <Card>
            <CardContent className="text-center py-6">
              <Shield style={{ height: 48, width: 48, margin: '0 auto 16px auto', display: 'block', color: 'var(--muted-foreground)' }} />
              <p className="text-muted-foreground">No security events found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { listFrom } from '@/hooks/usePageFetchers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Shield, Eye, Lock, Clock } from 'lucide-react';

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  user_id?: string;
  target_user_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function SecurityMonitoringDashboard() {
  const { isAdmin } = useAdminRoles();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetchSecurityEvents();
  }, [isAdmin]);

  const fetchSecurityEvents = async () => {
    try {
      setLoading(true);
      const data = await listFrom<SecurityEvent>(
        'security_monitoring',
        '*',
        { col: 'created_at', ascending: false },
        50,
      );
      setEvents(data);
    } catch (err) {
      console.error('Error fetching security events:', err);
      setError('Failed to load security events');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' };
      case 'high':
        return { backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' };
      case 'medium':
        return { backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' };
      default:
        return { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' };
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return AlertTriangle;
      case 'high': return Shield;
      case 'medium': return Eye;
      default: return Lock;
    }
  };

  const formatEventType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          You need administrator privileges to access this security dashboard.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Monitoring
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 bg-primary animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Monitoring Dashboard
            </span>
          </CardTitle>
          <Button onClick={fetchSecurityEvents} variant="outline" size="sm">
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4">
            {events.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                No security events recorded yet.
              </div>
            ) : (
              events.map((event) => {
                const SeverityIcon = getSeverityIcon(event.severity);
                return (
                  <Card key={event.id} style={{ borderLeft: '4px solid var(--primary)' }}>
                    <CardContent style={{ padding: 16 }}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <SeverityIcon className="h-5 w-5 mt-0.5" />
                          <div className="flex-1 flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">
                                {formatEventType(event.event_type)}
                              </span>
                              <Badge style={getSeverityColor(event.severity)}>
                                {event.severity}
                              </Badge>
                            </div>

                            <div className="text-sm text-muted-foreground flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {new Date(event.created_at).toLocaleString()}
                              </div>

                              {event.user_id && (
                                <div>
                                  User ID: <code className="text-xs">{event.user_id}</code>
                                </div>
                              )}

                              {event.target_user_id && (
                                <div>
                                  Target User: <code className="text-xs">{event.target_user_id}</code>
                                </div>
                              )}

                              {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-primary">
                                    View Details
                                  </summary>
                                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

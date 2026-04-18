import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Shield, Eye, Lock, Clock } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      const { data, error } = await supabase
        .from('security_monitoring')
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
      case 'critical':
        return AlertTriangle;
      case 'high':
        return Shield;
      case 'medium':
        return Eye;
      default:
        return Lock;
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
        <AlertTriangle style={{ height: 16, width: 16 }} />
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ height: 20, width: 20 }} />
              Security Monitoring
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
            <Box
              sx={{
                height: 32,
                width: 32,
                bgcolor: 'primary.main',
                animation: 'spin 1s linear infinite',
              }}
            />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ height: 20, width: 20 }} />
              Security Monitoring Dashboard
            </Box>
          </CardTitle>
          <Button onClick={fetchSecurityEvents} variant="outline" size="sm">
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert style={{ marginBottom: 16 }}>
              <AlertTriangle style={{ height: 16, width: 16 }} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {events.length === 0 ? (
              <Box sx={{ textAlign: 'center', color: 'var(--muted-foreground)', p: 4 }}>
                No security events recorded yet.
              </Box>
            ) : (
              events.map((event) => {
                const SeverityIcon = getSeverityIcon(event.severity);
                return (
                  <Card key={event.id} style={{ borderLeft: '4px solid var(--primary)' }}>
                    <CardContent style={{ padding: 16 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1 }}>
                          <SeverityIcon style={{ height: 20, width: 20, marginTop: 2 }} />
                          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Typography component="span" sx={{ fontWeight: 500 }}>
                                {formatEventType(event.event_type)}
                              </Typography>
                              <Badge style={getSeverityColor(event.severity)}>
                                {event.severity}
                              </Badge>
                            </Box>

                            <Box
                              sx={{
                                fontSize: '0.875rem',
                                color: 'var(--muted-foreground)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0.5,
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Clock style={{ height: 12, width: 12 }} />
                                {new Date(event.created_at).toLocaleString()}
                              </Box>

                              {event.user_id && (
                                <Box>
                                  User ID:{' '}
                                  <code style={{ fontSize: '0.75rem' }}>{event.user_id}</code>
                                </Box>
                              )}

                              {event.target_user_id && (
                                <Box>
                                  Target User:{' '}
                                  <code style={{ fontSize: '0.75rem' }}>
                                    {event.target_user_id}
                                  </code>
                                </Box>
                              )}

                              {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <details style={{ marginTop: 8 }}>
                                  <summary style={{ cursor: 'pointer', color: 'var(--primary)' }}>
                                    View Details
                                  </summary>
                                  <pre
                                    style={{
                                      fontSize: '0.75rem',
                                      backgroundColor: 'var(--muted)',
                                      padding: 8,
                                      borderRadius: 4,
                                      marginTop: 4,
                                      overflow: 'auto',
                                    }}
                                  >
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

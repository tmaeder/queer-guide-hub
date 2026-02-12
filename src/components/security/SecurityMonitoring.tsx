import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SecurityEvent {
  id: string;
  event_type: string;
  user_id?: string;
  ip_address?: unknown;
  user_agent?: string;
  metadata: any;
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.025em' }}>Security Monitoring</Typography>
          <Typography sx={{ color: 'var(--muted-foreground)' }}>
            Monitor security events and potential threats
          </Typography>
        </Box>
        <Button onClick={fetchSecurityEvents} disabled={loading} size="sm">
          <RefreshCw style={{ height: 16, width: 16, marginRight: 8, ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        {events.map((event) => (
          <Card key={event.id}>
            <CardHeader style={{ paddingBottom: 12 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CardTitle style={{ fontSize: '1.125rem' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {getSeverityIcon(event.severity)}
                    {event.event_type.replace(/_/g, ' ')}
                  </Box>
                </CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Badge variant={getSeverityColor(event.severity)}>
                    {event.severity.toUpperCase()}
                  </Badge>
                  <Typography component="span" sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                    {new Date(event.created_at).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {event.user_id && (
                  <Typography variant="body2">
                    <Typography component="span" sx={{ fontWeight: 500 }}>User ID:</Typography> {event.user_id}
                  </Typography>
                )}
                {event.ip_address && (
                  <Typography variant="body2">
                    <Typography component="span" sx={{ fontWeight: 500 }}>IP Address:</Typography> {String(event.ip_address)}
                  </Typography>
                )}
                {Object.keys(event.metadata).length > 0 && (
                  <Typography variant="body2" component="div">
                    <Typography component="span" sx={{ fontWeight: 500 }}>Details:</Typography>
                    <pre style={{ marginTop: 4, fontSize: '0.75rem', backgroundColor: 'var(--muted)', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        ))}

        {events.length === 0 && !loading && (
          <Card>
            <CardContent style={{ textAlign: 'center', paddingTop: 24, paddingBottom: 24 }}>
              <Shield style={{ height: 48, width: 48, margin: '0 auto 16px auto', display: 'block', color: 'var(--muted-foreground)' }} />
              <Typography sx={{ color: 'var(--muted-foreground)' }}>No security events found</Typography>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}

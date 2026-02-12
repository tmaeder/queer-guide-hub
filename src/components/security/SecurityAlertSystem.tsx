import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Shield, X, Bell, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SecurityAlert {
  id: string;
  event_type: string;
  severity: string;
  metadata: any;
  created_at: string;
}

export function SecurityAlertSystem() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAdmin) return;

    // Fetch recent critical/high severity alerts
    fetchRecentAlerts();

    // Set up real-time subscription for new security events
    const channel = supabase
      .channel('security_alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'security_monitoring',
          filter: `severity.in.(critical,high)`
        },
        (payload) => {
          const newAlert = payload.new as SecurityAlert;
          setAlerts(prev => [newAlert, ...prev.slice(0, 9)]); // Keep latest 10
          
          // Show toast for critical alerts
          if (newAlert.severity === 'critical') {
            toast({
              title: "Critical Security Alert",
              description: formatEventType(newAlert.event_type),
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const fetchRecentAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('security_monitoring')
        .select('*')
        .in('severity', ['critical', 'high'])
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setAlerts(data || []);
    } catch (err) {
      console.error('Error fetching security alerts:', err);
    }
  };

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]));
  };

  const formatEventType = (type: string) => {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  const getSeveritySx = (severity: string) => {
    switch (severity) {
      case 'critical': return { bgcolor: 'error.main', color: 'error.contrastText' };
      case 'high': return { bgcolor: 'warning.main', color: 'warning.contrastText' };
      default: return { bgcolor: 'grey.200', color: 'text.secondary' };
    }
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const alertTime = new Date(dateString);
    const diffMinutes = Math.floor((now.getTime() - alertTime.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  if (!isAdmin) return null;

  const visibleAlerts = alerts.filter(alert => !dismissedAlerts.has(alert.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {visibleAlerts.map((alert) => (
        <Card key={alert.id} sx={{ borderLeft: 4, borderColor: 'error.main' }}>
          <CardContent sx={{ p: 1.5 }}>
            <Alert sx={{ border: 'none', p: 0, bgcolor: 'transparent' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  {alert.severity === 'critical' ? (
                    <AlertTriangle style={{ width: 16, height: 16, marginTop: 2, color: 'var(--destructive)' }} />
                  ) : (
                    <Shield style={{ width: 16, height: 16, marginTop: 2, color: 'var(--warning)' }} />
                  )}
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                        {formatEventType(alert.event_type)}
                      </Typography>
                      <Badge sx={getSeveritySx(alert.severity)} variant="secondary">
                        {alert.severity}
                      </Badge>
                    </Box>

                    <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      {getTimeAgo(alert.created_at)}
                    </Box>

                    {alert.metadata?.justification && (
                      <Typography variant="caption" color="text.secondary">
                        Reason: {alert.metadata.justification}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissAlert(alert.id)}
                  sx={{ height: 24, width: 24, p: 0 }}
                >
                  <X style={{ width: 12, height: 12 }} />
                </Button>
              </Box>
            </Alert>
          </CardContent>
        </Card>
      ))}

      {visibleAlerts.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="outline" size="sm" onClick={fetchRecentAlerts}>
            <Bell style={{ width: 12, height: 12, marginRight: 4 }} />
            Refresh Alerts
          </Button>
        </Box>
      )}
    </Box>
  );
}
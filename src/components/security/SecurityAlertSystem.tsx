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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-warning text-warning-foreground';
      default: return 'bg-secondary text-secondary-foreground';
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
    <div className="space-y-2">
      {visibleAlerts.map((alert) => (
        <Card key={alert.id} className="border-l-4 border-l-destructive">
          <CardContent className="p-3">
            <Alert className="border-none p-0 bg-transparent">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {alert.severity === 'critical' ? (
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  ) : (
                    <Shield className="h-4 w-4 text-warning mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {formatEventType(alert.event_type)}
                      </span>
                      <Badge className={getSeverityColor(alert.severity)} variant="secondary">
                        {alert.severity}
                      </Badge>
                    </div>
                    
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {getTimeAgo(alert.created_at)}
                    </div>
                    
                    {alert.metadata?.justification && (
                      <div className="text-xs text-muted-foreground">
                        Reason: {alert.metadata.justification}
                      </div>
                    )}
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissAlert(alert.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </Alert>
          </CardContent>
        </Card>
      ))}
      
      {visibleAlerts.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={fetchRecentAlerts}>
            <Bell className="h-3 w-3 mr-1" />
            Refresh Alerts
          </Button>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';
import { Shield, AlertTriangle, CheckCircle, Activity, Users, MapPin, DollarSign } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SecurityMetric {
  id: string;
  event_type: string;
  metadata: any;
  details: any;
  created_at: string;
  user_id?: string;
  ip_address?: unknown;
  user_agent?: string;
}

interface SecurityStats {
  criticalEvents: number;
  highEvents: number;
  mediumEvents: number;
  totalEvents: number;
  privacyUpdates: number;
  locationAnonymizations: number;
  adminDataAccess: number;
}

export function EnhancedSecurityDashboard() {
  const [securityEvents, setSecurityEvents] = useState<SecurityMetric[]>([]);
  const [stats, setStats] = useState<SecurityStats>({
    criticalEvents: 0,
    highEvents: 0,
    mediumEvents: 0,
    totalEvents: 0,
    privacyUpdates: 0,
    locationAnonymizations: 0,
    adminDataAccess: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);

      // Fetch recent security events
      const { data: events, error: eventsError } = await api
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) throw eventsError;

      setSecurityEvents(events || []);

      // Calculate stats - determine severity from event type
      const eventStats = events?.reduce((acc, event) => {
        acc.totalEvents++;

        // Determine severity from event type
        let severity = 'medium';
        if (event.event_type.includes('CRITICAL') || event.event_type.includes('SECURITY_INCIDENT')) {
          severity = 'critical';
          acc.criticalEvents++;
        } else if (event.event_type.includes('ADMIN') || event.event_type.includes('ACCESS') || event.event_type.includes('FINANCIAL')) {
          severity = 'high';
          acc.highEvents++;
        } else {
          acc.mediumEvents++;
        }

        if (event.event_type === 'PRIVACY_SETTINGS_UPDATED') {
          acc.privacyUpdates++;
        } else if (event.event_type === 'LOCATION_DATA_ANONYMIZED') {
          acc.locationAnonymizations++;
        } else if (event.event_type.includes('ADMIN') && event.event_type.includes('ACCESS')) {
          acc.adminDataAccess++;
        }

        return acc;
      }, {
        criticalEvents: 0,
        highEvents: 0,
        mediumEvents: 0,
        totalEvents: 0,
        privacyUpdates: 0,
        locationAnonymizations: 0,
        adminDataAccess: 0
      }) || stats;

      setStats(eventStats);
    } catch (error) {
      console.error('Error fetching security data:', error);
      toast({
        title: "Error",
        description: "Failed to load security dashboard data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerLocationAnonymization = async () => {
    try {
      const { error } = await api.rpc('anonymize_location_data');
      if (error) throw error;

      toast({
        title: "Success",
        description: "Location data anonymization completed.",
        variant: "default"
      });

      // Refresh data
      fetchSecurityData();
    } catch (error) {
      console.error('Error anonymizing location data:', error);
      toast({
        title: "Error",
        description: "Failed to anonymize location data.",
        variant: "destructive"
      });
    }
  };

  const getSeverityIcon = (event: SecurityMetric) => {
    // Determine severity from event type
    if (event.event_type.includes('CRITICAL') || event.event_type.includes('SECURITY_INCIDENT')) {
      return <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />;
    } else if (event.event_type.includes('ADMIN') || event.event_type.includes('ACCESS') || event.event_type.includes('FINANCIAL')) {
      return <Shield style={{ height: 16, width: 16, color: 'var(--secondary)' }} />;
    } else {
      return <CheckCircle style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />;
    }
  };

  const getSeverityBadge = (event: SecurityMetric) => {
    // Determine severity from event type
    let severity = 'medium';
    let variant: 'destructive' | 'secondary' | 'outline' = 'outline';

    if (event.event_type.includes('CRITICAL') || event.event_type.includes('SECURITY_INCIDENT')) {
      severity = 'critical';
      variant = 'destructive';
    } else if (event.event_type.includes('ADMIN') || event.event_type.includes('ACCESS') || event.event_type.includes('FINANCIAL')) {
      severity = 'high';
      variant = 'secondary';
    }

    return (
      <Badge variant={variant}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 256 }}>
        <Box sx={{ animation: 'spin 1s linear infinite', height: 32, width: 32, bgcolor: 'primary.main' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Security Overview Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', py: 0, pb: 1 }}>
            <CardTitle>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>Critical Events</Typography>
            </CardTitle>
            <AlertTriangle style={{ height: 16, width: 16, color: 'var(--destructive)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'error.main' }}>{stats.criticalEvents}</Typography>
            <Typography variant="caption" color="text.secondary">Require immediate attention</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', py: 0, pb: 1 }}>
            <CardTitle>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>High Priority</Typography>
            </CardTitle>
            <Shield style={{ height: 16, width: 16, color: 'var(--secondary)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{stats.highEvents}</Typography>
            <Typography variant="caption" color="text.secondary">Security events</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', py: 0, pb: 1 }}>
            <CardTitle>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>Privacy Updates</Typography>
            </CardTitle>
            <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{stats.privacyUpdates}</Typography>
            <Typography variant="caption" color="text.secondary">Settings changed</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', py: 0, pb: 1 }}>
            <CardTitle>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>Admin Access</Typography>
            </CardTitle>
            <DollarSign style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{stats.adminDataAccess}</Typography>
            <Typography variant="caption" color="text.secondary">Sensitive data access</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Security Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Security Actions</CardTitle>
          <CardDescription>
            Manage security policies and data protection measures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
              <Button onClick={triggerLocationAnonymization} variant="outline">
                <MapPin style={{ height: 16, width: 16, marginRight: 8 }} />
                Anonymize Location Data
              </Button>
              <Button onClick={fetchSecurityData} variant="outline">
                <Activity style={{ height: 16, width: 16, marginRight: 8 }} />
                Refresh Data
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Security Events</CardTitle>
          <CardDescription>
            Latest security-related activities and alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {securityEvents.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                No security events recorded
              </Box>
            ) : (
              securityEvents.map((event) => (
                <Box key={event.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Box sx={{ flexShrink: 0 }}>
                    {getSeverityIcon(event)}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {event.event_type.replace(/_/g, ' ')}
                      </Typography>
                      {getSeverityBadge(event)}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(event.created_at).toLocaleString()}
                    </Typography>
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <Box sx={{ mt: 1, fontSize: '0.75rem', color: 'text.secondary' }}>
                        <details>
                          <summary style={{ cursor: 'pointer' }}>Event details</summary>
                          <Box
                            component="pre"
                            sx={{ mt: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.75rem', overflow: 'auto' }}
                          >
                            {JSON.stringify(event.metadata, null, 2)}
                          </Box>
                        </details>
                      </Box>
                    )}
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Security Status Alert */}
      {stats.criticalEvents > 0 && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertTitle>Critical Security Alert</AlertTitle>
          <AlertDescription>
            You have {stats.criticalEvents} critical security event(s) that require immediate attention.
            Please review the events above and take appropriate action.
          </AlertDescription>
        </Alert>
      )}
    </Box>
  );
}

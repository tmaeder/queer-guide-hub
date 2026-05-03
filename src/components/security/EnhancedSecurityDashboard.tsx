import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Shield, AlertTriangle, CheckCircle, Activity, Users, MapPin, DollarSign, Loader2 } from 'lucide-react';

interface SecurityMetric {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  details: Record<string, unknown>;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);

      // Fetch recent security events
      const { data: events, error: eventsError } = await supabase
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
        const _severity = 'medium';
        if (event.event_type.includes('CRITICAL') || event.event_type.includes('SECURITY_INCIDENT')) {
          _severity = 'critical';
          acc.criticalEvents++;
        } else if (event.event_type.includes('ADMIN') || event.event_type.includes('ACCESS') || event.event_type.includes('FINANCIAL')) {
          _severity = 'high';
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
      const { error } = await supabase.rpc('anonymize_location_data');
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
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Security Overview Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <p className="text-sm font-medium">Critical Events</p>
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-destructive">{stats.criticalEvents}</p>
            <span className="text-xs text-muted-foreground">Require immediate attention</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <p className="text-sm font-medium">High Priority</p>
            </CardTitle>
            <Shield className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{stats.highEvents}</p>
            <span className="text-xs text-muted-foreground">Security events</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <p className="text-sm font-medium">Privacy Updates</p>
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{stats.privacyUpdates}</p>
            <span className="text-xs text-muted-foreground">Settings changed</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <p className="text-sm font-medium">Admin Access</p>
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{stats.adminDataAccess}</p>
            <span className="text-xs text-muted-foreground">Sensitive data access</span>
          </CardContent>
        </Card>
      </div>

      {/* Security Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Security Actions</CardTitle>
          <CardDescription>
            Manage security policies and data protection measures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={triggerLocationAnonymization} variant="outline">
                <MapPin className="h-4 w-4 mr-2" />
                Anonymize Location Data
              </Button>
              <Button onClick={fetchSecurityData} variant="outline">
                <Activity className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
            </div>
          </div>
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
          <div className="flex flex-col gap-4">
            {securityEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No security events recorded
              </div>
            ) : (
              securityEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-4 p-4 border border-border rounded-lg">
                  <div className="flex-shrink-0">{getSeverityIcon(event)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {event.event_type.replace(/_/g, ' ')}
                      </p>
                      {getSeverityBadge(event)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <details>
                          <summary className="cursor-pointer">Event details</summary>
                          <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Status Alert */}
      {stats.criticalEvents > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Security Alert</AlertTitle>
          <AlertDescription>
            You have {stats.criticalEvents} critical security event(s) that require immediate attention.
            Please review the events above and take appropriate action.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// suppress unused warn
void CheckCircle;

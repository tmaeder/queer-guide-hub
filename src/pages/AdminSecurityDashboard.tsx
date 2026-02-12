import React from 'react';
import { AdminRouteGuard } from '@/components/security/AdminRouteGuard';
import { EnhancedSecurityDashboard } from "@/components/security/EnhancedSecurityDashboard";
import { AutomatedSecurityScheduler } from "@/components/security/AutomatedSecurityScheduler";
import { PrivacyControlCenter } from "@/components/security/PrivacyControlCenter";
import { useConsolidatedSecurity } from '@/hooks/useConsolidatedSecurity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  AlertTriangle,
  Activity,
  Lock,
  MapPin,
  DollarSign,
  Users,
  FileText
} from 'lucide-react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function AdminSecurityDashboard() {
  const {
    securityMetrics,
    loading,
    anonymizeLocationData,
    triggerSecurityIncident,
    refreshMetrics
  } = useConsolidatedSecurity();

  const handleEmergencyLockdown = () => {
    triggerSecurityIncident('EMERGENCY_LOCKDOWN', 'critical', {
      manual_trigger: true,
      admin_action: 'emergency_lockdown_initiated'
    });
  };

  const SecurityMetricsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity style={{ height: 20, width: 20 }} />
          Security Metrics (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Box sx={{ width: 24, height: 24, bgcolor: 'primary.main', animation: 'spin 1s linear infinite' }} />
          </Box>
        ) : securityMetrics ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'error.main' }}>
                {securityMetrics.criticalAlerts}
              </Typography>
              <Typography variant="body2" color="text.secondary">Critical Alerts</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
                {securityMetrics.highAlerts}
              </Typography>
              <Typography variant="body2" color="text.secondary">High Alerts</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {securityMetrics.totalEvents}
              </Typography>
              <Typography variant="body2" color="text.secondary">Total Events</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {securityMetrics.suspiciousActivityScore}
              </Typography>
              <Typography variant="body2" color="text.secondary">Risk Score</Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No metrics available</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const QuickActionsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield style={{ height: 20, width: 20 }} />
          Quick Security Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Button
            onClick={anonymizeLocationData}
            variant="outline"
            style={{ width: '100%' }}
          >
            <MapPin style={{ height: 16, width: 16, marginRight: 8 }} />
            Anonymize All Location Data
          </Button>

          <Button
            onClick={refreshMetrics}
            variant="outline"
            style={{ width: '100%' }}
          >
            <Activity style={{ height: 16, width: 16, marginRight: 8 }} />
            Refresh Security Metrics
          </Button>

          <Button
            onClick={handleEmergencyLockdown}
            variant="destructive"
            style={{ width: '100%' }}
          >
            <AlertTriangle style={{ height: 16, width: 16, marginRight: 8 }} />
            Emergency Security Lockdown
          </Button>
        </Box>
      </CardContent>
    </Card>
  );

  const SecurityStatusCard = () => (
    <Card>
      <CardHeader>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock style={{ height: 20, width: 20 }} />
          Security Status Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">Profile Data Protection</Typography>
            <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</Badge>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">Location Anonymization</Typography>
            <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</Badge>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">Financial Data Guards</Typography>
            <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</Badge>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">Enhanced Monitoring</Typography>
            <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</Badge>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2">Photo Privacy Controls</Typography>
            <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</Badge>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <AdminRouteGuard requiredRole="admin">
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Security Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Monitor security events, manage data protection, and respond to incidents.
          </Typography>
        </Box>

        {/* Security Overview */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
          <SecurityMetricsCard />
          <QuickActionsCard />
          <SecurityStatusCard />
        </Box>

        {/* Enhanced Security Notice */}
        <Box sx={{ mb: 3 }}>
          <Alert>
            <Shield style={{ height: 16, width: 16 }} />
            <AlertDescription>
              <strong>Enhanced Security Measures Active:</strong> This dashboard includes
              automatic location anonymization, financial data protection, enhanced profile
              privacy controls, and comprehensive security monitoring. All administrative
              actions are logged and audited.
            </AlertDescription>
          </Alert>
        </Box>

        <Tabs defaultValue="monitoring" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <TabsTrigger value="monitoring" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity style={{ height: 16, width: 16 }} />
              Monitoring
            </TabsTrigger>
            <TabsTrigger value="profiles" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users style={{ height: 16, width: 16 }} />
              Profile Security
            </TabsTrigger>
            <TabsTrigger value="financial" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign style={{ height: 16, width: 16 }} />
              Financial Protection
            </TabsTrigger>
            <TabsTrigger value="compliance" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText style={{ height: 16, width: 16 }} />
              Compliance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <EnhancedSecurityDashboard />
            <AutomatedSecurityScheduler />
          </TabsContent>

          <TabsContent value="profiles" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <PrivacyControlCenter />
            <Card>
              <CardHeader>
                <CardTitle>Profile Security Management</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Shield style={{ height: 16, width: 16 }} />
                  <AlertDescription>
                    Profile access is now protected by enhanced RLS policies. Sensitive
                    data like sexual orientation, gender identity, and financial information
                    requires explicit justification for administrative access.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financial" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Card>
              <CardHeader>
                <CardTitle>Financial Data Protection</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <DollarSign style={{ height: 16, width: 16 }} />
                  <AlertDescription>
                    All financial data access requires detailed justification (minimum 20 characters)
                    and is subject to enhanced audit logging. Emergency access procedures are
                    available for urgent legal compliance needs.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Card>
              <CardHeader>
                <CardTitle>Compliance & Audit Trail</CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">GDPR Data Protection</Typography>
                    <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Compliant</Badge>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">Location Data Retention</Typography>
                    <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>30-day Auto-Anonymization</Badge>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">Financial Data Access</Typography>
                    <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Enhanced Audit Trail</Badge>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">Admin Access Logging</Typography>
                    <Badge style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Comprehensive</Badge>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Container>
    </AdminRouteGuard>
  );
}

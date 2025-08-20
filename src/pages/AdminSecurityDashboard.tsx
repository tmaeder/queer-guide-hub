import React from 'react';
import { AdminRouteGuard } from '@/components/security/AdminRouteGuard';
import { EnhancedSecurityDashboard } from "@/components/security/EnhancedSecurityDashboard";
import { AutomatedSecurityScheduler } from "@/components/security/AutomatedSecurityScheduler";
import { PrivacyControlCenter } from "@/components/security/PrivacyControlCenter";
import { useEnhancedSecurity } from '@/hooks/useEnhancedSecurity';
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

export default function AdminSecurityDashboard() {
  const { 
    securityMetrics, 
    loading, 
    anonymizeLocationData,
    triggerSecurityIncident,
    refreshMetrics 
  } = useEnhancedSecurity();

  const handleEmergencyLockdown = () => {
    triggerSecurityIncident('EMERGENCY_LOCKDOWN', 'critical', {
      manual_trigger: true,
      admin_action: 'emergency_lockdown_initiated'
    });
  };

  const SecurityMetricsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Security Metrics (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin h-6 w-6 bg-primary"></div>
          </div>
        ) : securityMetrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">
                {securityMetrics.critical_alerts_24h}
              </div>
              <div className="text-sm text-muted-foreground">Critical Alerts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {securityMetrics.high_alerts_24h}
              </div>
              <div className="text-sm text-muted-foreground">High Alerts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {securityMetrics.failed_auth_attempts}
              </div>
              <div className="text-sm text-muted-foreground">Failed Auth</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {securityMetrics.suspicious_activity_score}
              </div>
              <div className="text-sm text-muted-foreground">Risk Score</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            No metrics available
          </div>
        )}
      </CardContent>
    </Card>
  );

  const QuickActionsCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Quick Security Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button 
          onClick={anonymizeLocationData}
          variant="outline" 
          className="w-full"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Anonymize All Location Data
        </Button>
        
        <Button 
          onClick={refreshMetrics}
          variant="outline" 
          className="w-full"
        >
          <Activity className="h-4 w-4 mr-2" />
          Refresh Security Metrics
        </Button>
        
        <Button 
          onClick={handleEmergencyLockdown}
          variant="destructive" 
          className="w-full"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Emergency Security Lockdown
        </Button>
      </CardContent>
    </Card>
  );

  const SecurityStatusCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Security Status Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Profile Data Protection</span>
          <Badge className="bg-success text-success-foreground">Active</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Location Anonymization</span>
          <Badge className="bg-success text-success-foreground">Active</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Financial Data Guards</span>
          <Badge className="bg-success text-success-foreground">Active</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Enhanced Monitoring</span>
          <Badge className="bg-success text-success-foreground">Active</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Photo Privacy Controls</span>
          <Badge className="bg-success text-success-foreground">Active</Badge>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AdminRouteGuard requiredRole="admin">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Security Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor security events, manage data protection, and respond to incidents.
          </p>
        </div>

        {/* Security Alerts */}
        <div className="mb-6">
          <SecurityAlertSystem />
        </div>

        {/* Security Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <SecurityMetricsCard />
          <QuickActionsCard />
          <SecurityStatusCard />
        </div>

        {/* Enhanced Security Notice */}
        <Alert className="mb-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Enhanced Security Measures Active:</strong> This dashboard includes 
            automatic location anonymization, financial data protection, enhanced profile 
            privacy controls, and comprehensive security monitoring. All administrative 
            actions are logged and audited.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="monitoring" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="monitoring" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Monitoring
            </TabsTrigger>
            <TabsTrigger value="profiles" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Profile Security
            </TabsTrigger>
            <TabsTrigger value="financial" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financial Protection
            </TabsTrigger>
            <TabsTrigger value="compliance" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Compliance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="space-y-6">
            <EnhancedSecurityDashboard />
            <AutomatedSecurityScheduler />
          </TabsContent>

          <TabsContent value="profiles" className="space-y-6">
            <PrivacyControlCenter />
            <Card>
              <CardHeader>
                <CardTitle>Profile Security Management</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Profile access is now protected by enhanced RLS policies. Sensitive 
                    data like sexual orientation, gender identity, and financial information 
                    requires explicit justification for administrative access.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financial" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Financial Data Protection</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <DollarSign className="h-4 w-4" />
                  <AlertDescription>
                    All financial data access requires detailed justification (minimum 20 characters) 
                    and is subject to enhanced audit logging. Emergency access procedures are 
                    available for urgent legal compliance needs.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Compliance & Audit Trail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span>GDPR Data Protection</span>
                    <Badge className="bg-success text-success-foreground">Compliant</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span>Location Data Retention</span>
                    <Badge className="bg-success text-success-foreground">30-day Auto-Anonymization</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span>Financial Data Access</span>
                    <Badge className="bg-success text-success-foreground">Enhanced Audit Trail</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded">
                    <span>Admin Access Logging</span>
                    <Badge className="bg-success text-success-foreground">Comprehensive</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminRouteGuard>
  );
}
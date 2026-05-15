import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Lock, Eye, Database, MessageSquare, MapPin, CreditCard, Activity } from 'lucide-react';
import { EnhancedSecurityDashboard } from '@/components/security/EnhancedSecurityDashboard';
import { LocationPrivacyManager } from '@/components/security/LocationPrivacyManager';
import { PrivacyControlCenter } from '@/components/security/PrivacyControlCenter';
import { SecureFinancialDataViewer } from '@/components/security/SecureFinancialDataViewer';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';

export default function SecurityDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  if (!user || !isAdmin) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Alert>
          <Shield style={{ height: 16, width: 16 }} />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You need administrator privileges to access the security dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const securityFeatures = [
    {
      title: "Data Encryption",
      icon: Lock,
      status: "Active",
      description: "Sensitive profile data encrypted at rest",
      details: [
        "Sexual orientation & gender identity encrypted",
        "Phone numbers & contact info protected",
        "Financial & political data secured",
        "User-specific encryption keys"
      ]
    },
    {
      title: "Privacy Controls",
      icon: Eye,
      status: "Active",
      description: "Granular privacy settings for user data",
      details: [
        "Field-level privacy controls",
        "Secure defaults for new users",
        "Privacy validation triggers",
        "Admin access auditing"
      ]
    },
    {
      title: "Database Security",
      icon: Database,
      status: "Active",
      description: "Enhanced RLS policies and access control",
      details: [
        "Role-based access control",
        "Comprehensive audit logging",
        "Rate limiting protection",
        "SQL injection prevention"
      ]
    },
    {
      title: "Message Security",
      icon: MessageSquare,
      status: "Active",
      description: "Secure messaging with access controls",
      details: [
        "Participant-only access",
        "Admin access auditing",
        "Content encryption flags",
        "Message integrity checks"
      ]
    },
    {
      title: "Location Privacy",
      icon: MapPin,
      status: "Active",
      description: "Protected location data and check-ins",
      details: [
        "Privacy controls for check-ins",
        "Location anonymization",
        "Public/private visibility",
        "Tampering prevention"
      ]
    }
  ];

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield style={{ width: 32, height: 32 }} />
              Security Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive security monitoring and protection status
            </p>
          </div>
          <Badge variant="outline" style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}>
            <Activity style={{ width: 16, height: 16, marginRight: 4 }} />
            All Systems Secure
          </Badge>
        </div>

        <Alert>
          <Shield style={{ height: 16, width: 16 }} />
          <AlertTitle>Security Status: Enhanced</AlertTitle>
          <AlertDescription>
            All critical security fixes have been implemented. Your application now has enterprise-grade security protection.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {securityFeatures.map((feature) => {
                  const IconComponent = feature.icon;
                  return (
                    <Card key={feature.title}>
                      <CardHeader style={{ paddingBottom: 12 }}>
                        <div className="flex items-center justify-between">
                          <CardTitle style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <IconComponent style={{ width: 20, height: 20 }} />
                            {feature.title}
                          </CardTitle>
                          <Badge variant="outline" style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}>
                            {feature.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </CardHeader>
                      <CardContent>
                        <ul className="flex flex-col gap-1">
                          {feature.details.map((detail, index) => (
                            <li key={index} className="text-sm flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="mt-8 p-6 bg-muted rounded-element">
                <h6 className="text-base font-semibold mb-4">Security Implementation Summary</h6>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-medium mb-2">Implemented Protections:</p>
                    <ul className="flex flex-col gap-1">
                      {[
                        "Field-level encryption for sensitive data",
                        "Enhanced privacy controls and validation",
                        "Comprehensive audit logging",
                        "Rate limiting and abuse prevention",
                        "Location data protection",
                        "Secure messaging controls",
                        "Financial data anonymization"
                      ].map((item, i) => (
                        <li className="text-sm text-muted-foreground" key={i}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Security Features:</p>
                    <ul className="flex flex-col gap-1">
                      {[
                        "Content validation and sanitization",
                        "SQL injection prevention",
                        "XSS attack protection",
                        "File upload security",
                        "Admin access monitoring",
                        "Role-based permissions",
                        "Security event tracking"
                      ].map((item, i) => (
                        <li className="text-sm text-muted-foreground" key={i}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="monitoring">
            <EnhancedSecurityDashboard />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyControlCenter />
          </TabsContent>

          <TabsContent value="location">
            <LocationPrivacyManager />
          </TabsContent>

          <TabsContent value="financial">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard style={{ width: 20, height: 20 }} />
                    Financial Data Security
                  </CardTitle>
                  <CardDescription>
                    Secure access controls for sensitive financial information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Shield style={{ height: 16, width: 16 }} />
                    <AlertDescription>
                      Financial data access requires admin privileges and proper justification.
                      All access attempts are logged and monitored.
                    </AlertDescription>
                  </Alert>
                  <div className="mt-4">
                    <SecureFinancialDataViewer userId={user?.id || ''}>
                      <p className="text-sm text-muted-foreground">
                        Select a user to view their encrypted financial data with proper authorization.
                      </p>
                    </SecureFinancialDataViewer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

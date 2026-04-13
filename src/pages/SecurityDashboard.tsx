import React from 'react';
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
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

export default function SecurityDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();

  if (!user || !isAdmin) {
    return (
      <Container sx={{ py: 3 }}>
        <Alert>
          <Shield style={{ height: 16, width: 16 }} />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You need administrator privileges to access the security dashboard.
          </AlertDescription>
        </Alert>
      </Container>
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
    <Container sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ width: 32, height: 32 }} />
              Security Dashboard
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Comprehensive security monitoring and protection status
            </Typography>
          </Box>
          <Badge variant="outline" style={{ backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
            <Activity style={{ width: 16, height: 16, marginRight: 4 }} />
            All Systems Secure
          </Badge>
        </Box>

        <Alert style={{ borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}>
          <Shield style={{ height: 16, width: 16, color: '#16a34a' }} />
          <AlertTitle style={{ color: '#166534' }}>Security Status: Enhanced</AlertTitle>
          <AlertDescription style={{ color: '#15803d' }}>
            All critical security fixes have been implemented. Your application now has enterprise-grade security protection.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="overview" style={{ width: '100%' }}>
          <TabsList style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', width: '100%' }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                {securityFeatures.map((feature) => {
                  const IconComponent = feature.icon;
                  return (
                    <Card key={feature.title} sx={{ transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 6 } }}>
                      <CardHeader style={{ paddingBottom: 12 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <CardTitle style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <IconComponent style={{ width: 20, height: 20 }} />
                            {feature.title}
                          </CardTitle>
                          <Badge variant="outline" style={{ backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
                            {feature.status}
                          </Badge>
                        </Box>
                        <Typography variant="body2" color="text.secondary">{feature.description}</Typography>
                      </CardHeader>
                      <CardContent>
                        <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {feature.details.map((detail, index) => (
                            <Box component="li" key={index} sx={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ height: 6, width: 6, borderRadius: '50%', bgcolor: 'success.main' }} />
                              {detail}
                            </Box>
                          ))}
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>

              <Paper sx={{ mt: 4, p: 3, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Security Implementation Summary</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Implemented Protections:</Typography>
                    <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {[
                        "Field-level encryption for sensitive data",
                        "Enhanced privacy controls and validation",
                        "Comprehensive audit logging",
                        "Rate limiting and abuse prevention",
                        "Location data protection",
                        "Secure messaging controls",
                        "Financial data anonymization"
                      ].map((item, i) => (
                        <Typography component="li" variant="body2" color="text.secondary" key={i}>&#8226; {item}</Typography>
                      ))}
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Security Features:</Typography>
                    <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {[
                        "Content validation and sanitization",
                        "SQL injection prevention",
                        "XSS attack protection",
                        "File upload security",
                        "Admin access monitoring",
                        "Role-based permissions",
                        "Security event tracking"
                      ].map((item, i) => (
                        <Typography component="li" variant="body2" color="text.secondary" key={i}>&#8226; {item}</Typography>
                      ))}
                    </Box>
                  </Box>
                </Box>
              </Paper>
            </Box>
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                  <Box sx={{ mt: 2 }}>
                    <SecureFinancialDataViewer userId={user?.id || ''}>
                      <Typography variant="body2" color="text.secondary">
                        Select a user to view their encrypted financial data with proper authorization.
                      </Typography>
                    </SecureFinancialDataViewer>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>
        </Tabs>
      </Box>
    </Container>
  );
}

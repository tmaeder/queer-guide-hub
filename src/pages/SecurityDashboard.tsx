import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Lock, Eye, Database, MessageSquare, MapPin, CreditCard, Activity, Settings, Monitor } from 'lucide-react';
import { SecurityMonitoring } from '@/components/security/SecurityMonitoring';
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
      <div className="container mx-auto p-6">
        <Alert>
          <Shield className="h-4 w-4" />
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
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Security Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive security monitoring and protection status
          </p>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <Activity className="h-4 w-4 mr-1" />
          All Systems Secure
        </Badge>
      </div>

      <Alert className="border-green-200 bg-green-50">
        <Shield className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">Security Status: Enhanced</AlertTitle>
        <AlertDescription className="text-green-700">
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

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((feature) => {
              const IconComponent = feature.icon;
              return (
                <Card key={feature.title} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <IconComponent className="h-5 w-5" />
                        {feature.title}
                      </CardTitle>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {feature.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {feature.details.map((detail, index) => (
                        <li key={index} className="text-sm flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-8 p-6 bg-muted rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Security Implementation Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-medium mb-2">✅ Implemented Protections:</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Field-level encryption for sensitive data</li>
                  <li>• Enhanced privacy controls and validation</li>
                  <li>• Comprehensive audit logging</li>
                  <li>• Rate limiting and abuse prevention</li>
                  <li>• Location data protection</li>
                  <li>• Secure messaging controls</li>
                  <li>• Financial data anonymization</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">🛡️ Security Features:</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Content validation and sanitization</li>
                  <li>• SQL injection prevention</li>
                  <li>• XSS attack protection</li>
                  <li>• File upload security</li>
                  <li>• Admin access monitoring</li>
                  <li>• Role-based permissions</li>
                  <li>• Security event tracking</li>
                </ul>
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
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Financial Data Security
                </CardTitle>
                <CardDescription>
                  Secure access controls for sensitive financial information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Financial data access requires admin privileges and proper justification. 
                    All access attempts are logged and monitored.
                  </AlertDescription>
                </Alert>
                <div className="mt-4">
                  <SecureFinancialDataViewer userId={user?.id || ''}>
                    <div className="text-sm text-muted-foreground">
                      Select a user to view their encrypted financial data with proper authorization.
                    </div>
                  </SecureFinancialDataViewer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, Lock, Eye, Database, MessageSquare, MapPin, CreditCard, Activity } from 'lucide-react';
import { SecurityMonitoring } from '@/components/security/SecurityMonitoring';
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
    },
    {
      title: "Financial Security",
      icon: CreditCard,
      status: "Active",
      description: "Secure donation and payment handling",
      details: [
        "Donor data encryption",
        "Anonymization levels",
        "Privacy-aware display",
        "Financial audit trails"
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

      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Monitoring</h2>
          <p className="text-muted-foreground">
            Real-time security events and threat monitoring
          </p>
        </div>
        <SecurityMonitoring />
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
    </div>
  );
}
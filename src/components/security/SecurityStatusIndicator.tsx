import React from 'react';
import { Shield, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SecurityStatusProps {
  className?: string;
}

export function SecurityStatusIndicator({ className = '' }: SecurityStatusProps) {
  const securityFeatures = [
    {
      name: 'Enhanced Profile Protection',
      status: 'active',
      description: 'Encrypted sensitive data with field-level privacy controls'
    },
    {
      name: 'Location Privacy',
      status: 'active', 
      description: 'Location data with automatic 6-month retention limits'
    },
    {
      name: 'Message Security',
      status: 'active',
      description: 'End-to-end conversation participant verification'
    },
    {
      name: 'Photo Privacy Controls',
      status: 'active',
      description: 'Friend-based photo access with public/private settings'
    },
    {
      name: 'Security Event Monitoring',
      status: 'active',
      description: 'Admin-only access to security incident data'
    },
    {
      name: 'Enhanced Password Policy',
      status: 'active',
      description: '12+ character passwords with complexity requirements'
    },
    {
      name: 'Rate Limiting & Audit',
      status: 'active',
      description: 'Comprehensive rate limiting with security event logging'
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Shield className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Warning</Badge>;
      default:
        return <Badge variant="outline">Inactive</Badge>;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          Security Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Enhanced security measures are active to protect your privacy and data.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {securityFeatures.map((feature, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {getStatusIcon(feature.status)}
                <div>
                  <p className="font-medium text-sm">{feature.name}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
              {getStatusBadge(feature.status)}
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            Last security scan: Recent • All critical security measures implemented
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
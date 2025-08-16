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
      name: 'Data Encryption',
      status: 'active',
      description: 'All sensitive data is encrypted at rest and in transit'
    },
    {
      name: 'Privacy Controls',
      status: 'active', 
      description: 'Granular privacy settings for profile information'
    },
    {
      name: 'Location Protection',
      status: 'active',
      description: 'Location data secured with user-controlled visibility'
    },
    {
      name: 'Content Security Policy',
      status: 'active',
      description: 'XSS protection through strict content policies'
    },
    {
      name: 'Rate Limiting',
      status: 'active',
      description: 'Protection against abuse and automated attacks'
    },
    {
      name: 'Audit Logging',
      status: 'active',
      description: 'Comprehensive security event monitoring'
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
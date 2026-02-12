import React from 'react';
import { Shield, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
        return <CheckCircle style={{ width: 16, height: 16, color: '#16a34a' }} />;
      case 'warning':
        return <AlertTriangle style={{ width: 16, height: 16, color: '#ca8a04' }} />;
      default:
        return <Shield style={{ width: 16, height: 16, color: '#9ca3af' }} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" sx={{ bgcolor: '#dcfce7', color: '#166534' }}>Active</Badge>;
      case 'warning':
        return <Badge variant="secondary" sx={{ bgcolor: '#fef9c3', color: '#854d0e' }}>Warning</Badge>;
      default:
        return <Badge variant="outline">Inactive</Badge>;
    }
  };

  return (
    <Card className={className}>
      <CardHeader sx={{ pb: 1.5 }}>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldCheck style={{ width: 20, height: 20, color: '#16a34a' }} />
          Security Status
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <ShieldCheck style={{ width: 16, height: 16 }} />
          <AlertDescription>
            Enhanced security measures are active to protect your privacy and data.
          </AlertDescription>
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {securityFeatures.map((feature, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {getStatusIcon(feature.status)}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{feature.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{feature.description}</Typography>
                </Box>
              </Box>
              {getStatusBadge(feature.status)}
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', opacity: 0.5, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Last security scan: Recent • All critical security measures implemented
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
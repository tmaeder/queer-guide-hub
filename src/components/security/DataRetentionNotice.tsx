import React from 'react';
import { Clock, Shield, Trash2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface DataRetentionNoticeProps {
  dataType: 'location' | 'messages' | 'photos' | 'profile';
  retentionPeriod: string;
  lastCleanup?: string;
  onRequestDeletion?: () => void;
  showControls?: boolean;
}

/**
 * DataRetentionNotice - Transparent data retention policy notification
 * Implements GDPR compliance through clear data lifecycle communication
 */
export function DataRetentionNotice({
  dataType,
  retentionPeriod,
  lastCleanup,
  onRequestDeletion,
  showControls = true
}: DataRetentionNoticeProps) {
  const getDataTypeInfo = () => {
    switch (dataType) {
      case 'location':
        return {
          icon: Clock,
          title: 'Location Data Retention',
          description: 'Your precise location data is automatically anonymized after 30 days and deleted after 6 months for privacy protection.',
          urgency: 'medium' as const
        };
      case 'messages':
        return {
          icon: Shield,
          title: 'Message Data Retention',
          description: 'Your messages are retained for the duration of your account. You can delete individual messages at any time.',
          urgency: 'low' as const
        };
      case 'photos':
        return {
          icon: AlertCircle,
          title: 'Photo Data Retention',
          description: 'Your photos are retained until you delete them. Private photos are never accessible to others.',
          urgency: 'low' as const
        };
      case 'profile':
        return {
          icon: Shield,
          title: 'Profile Data Retention',
          description: 'Your profile data is retained for the duration of your account. Sensitive fields are encrypted.',
          urgency: 'low' as const
        };
      default:
        return {
          icon: Clock,
          title: 'Data Retention',
          description: 'Data retention policies are in effect for your privacy protection.',
          urgency: 'low' as const
        };
    }
  };

  const info = getDataTypeInfo();
  const IconComponent = info.icon;

  return (
    <Card sx={{ width: '100%' }}>
      <CardHeader sx={{ pb: 1.5 }}>
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
            <IconComponent style={{ height: 16, width: 16 }} />
            {info.title}
          </Box>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert variant={info.urgency === 'medium' ? 'default' : 'default'}>
            <Shield style={{ height: 16, width: 16 }} />
            <AlertTitle>Privacy Protection Active</AlertTitle>
            <AlertDescription>
              {info.description}
            </AlertDescription>
          </Alert>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, fontSize: '0.875rem' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontWeight: 500 }}>Retention Period</Typography>
              <Typography color="text.secondary">{retentionPeriod}</Typography>
            </Box>

            {lastCleanup && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography sx={{ fontWeight: 500 }}>Last Cleanup</Typography>
                <Typography color="text.secondary">{lastCleanup}</Typography>
              </Box>
            )}
          </Box>

          {showControls && onRequestDeletion && (
            <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={onRequestDeletion}
                style={{ width: '100%' }}
              >
                <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                Request Data Deletion
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                You can request deletion of your data at any time. This action may take up to 30 days to complete.
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

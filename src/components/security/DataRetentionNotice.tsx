import React from 'react';
import { Clock, Shield, Trash2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <IconComponent className="h-4 w-4" />
          {info.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant={info.urgency === 'medium' ? 'default' : 'default'}>
          <Shield className="h-4 w-4" />
          <AlertTitle>Privacy Protection Active</AlertTitle>
          <AlertDescription>
            {info.description}
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="font-medium">Retention Period</div>
            <div className="text-muted-foreground">{retentionPeriod}</div>
          </div>

          {lastCleanup && (
            <div className="space-y-1">
              <div className="font-medium">Last Cleanup</div>
              <div className="text-muted-foreground">{lastCleanup}</div>
            </div>
          )}
        </div>

        {showControls && onRequestDeletion && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={onRequestDeletion}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Request Data Deletion
            </Button>
            <div className="text-xs text-muted-foreground mt-2">
              You can request deletion of your data at any time. This action may take up to 30 days to complete.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
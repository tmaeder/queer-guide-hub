import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Users, Globe, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PhotoPrivacyManagerProps {
  photoId: string;
  currentVisibility: 'private' | 'friends' | 'public';
  onVisibilityChange: (visibility: 'private' | 'friends' | 'public') => void;
  isOwner: boolean;
  enhancedSecurity?: boolean;
}

/**
 * PhotoPrivacyManager - Granular photo privacy controls
 * Default-private with explicit consent for sharing
 */
export function PhotoPrivacyManager({
  photoId,
  currentVisibility,
  onVisibilityChange,
  isOwner,
  enhancedSecurity = true
}: PhotoPrivacyManagerProps) {
  const [isChanging, setIsChanging] = useState(false);
  const { toast } = useToast();

  const visibilityOptions = [
    {
      value: 'private',
      label: 'Private',
      description: 'Only you can see this photo',
      icon: Lock,
      color: 'primary.main'
    },
    {
      value: 'friends',
      label: 'Friends Only',
      description: 'Only your friends can see this photo',
      icon: Users,
      color: 'text.secondary'
    },
    {
      value: 'public',
      label: 'Public',
      description: 'Anyone can see this photo',
      icon: Globe,
      color: 'warning.main'
    }
  ] as const;

  const currentOption = visibilityOptions.find(opt => opt.value === currentVisibility);

  const handleVisibilityChange = async (newVisibility: 'private' | 'friends' | 'public') => {
    if (!isOwner) {
      toast({
        title: "Access Denied",
        description: "You can only change privacy settings for your own photos.",
        variant: "destructive"
      });
      return;
    }

    setIsChanging(true);
    try {
      await onVisibilityChange(newVisibility);

      toast({
        title: "Privacy Settings Updated",
        description: `Photo visibility changed to ${newVisibility}`,
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update privacy settings",
        variant: "destructive"
      });
    } finally {
      setIsChanging(false);
    }
  };

  if (!isOwner) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
        {currentOption?.icon && <currentOption.icon style={{ height: 16, width: 16 }} />}
        <Typography component="span" variant="body2">{currentOption?.label}</Typography>
      </Box>
    );
  }

  return (
    <Card sx={{ width: '100%' }}>
      <CardHeader sx={{ pb: 1.5 }}>
        <CardTitle style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield style={{ height: 16, width: 16 }} />
          Photo Privacy Settings
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <Eye style={{ height: 16, width: 16 }} />
          <AlertDescription>
            Photos are private by default. Choose who can see this photo.
          </AlertDescription>
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {currentOption?.icon && (
              <currentOption.icon style={{ height: 20, width: 20 }} />
            )}
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 500 }}>{currentOption?.label}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {currentOption?.description}
              </Typography>
            </Box>
          </Box>

          <Select
            value={currentVisibility}
            onValueChange={handleVisibilityChange}
            disabled={isChanging}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibilityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <option.icon style={{ height: 16, width: 16 }} />
                    <Typography component="span" variant="body2">{option.label}</Typography>
                  </Box>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        {currentVisibility === 'public' && (
          <Alert style={{ borderColor: 'var(--warning)' }}>
            <Globe style={{ height: 16, width: 16 }} />
            <AlertDescription>
              <strong>Public photos</strong> can be seen by anyone and may be indexed by search engines.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

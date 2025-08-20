import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Users, Globe, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

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
      color: 'text-primary'
    },
    {
      value: 'friends',
      label: 'Friends Only',
      description: 'Only your friends can see this photo',
      icon: Users,
      color: 'text-secondary'
    },
    {
      value: 'public',
      label: 'Public',
      description: 'Anyone can see this photo',
      icon: Globe,
      color: 'text-warning'
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {currentOption?.icon && <currentOption.icon className="h-4 w-4" />}
        <span>{currentOption?.label}</span>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Photo Privacy Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            Photos are private by default. Choose who can see this photo.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {currentOption?.icon && (
              <currentOption.icon className={`h-5 w-5 ${currentOption.color}`} />
            )}
            <div className="flex-1">
              <div className="font-medium">{currentOption?.label}</div>
              <div className="text-sm text-muted-foreground">
                {currentOption?.description}
              </div>
            </div>
          </div>

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
                  <div className="flex items-center gap-2">
                    <option.icon className={`h-4 w-4 ${option.color}`} />
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentVisibility === 'public' && (
          <Alert className="border-warning">
            <Globe className="h-4 w-4" />
            <AlertDescription>
              <strong>Public photos</strong> can be seen by anyone and may be indexed by search engines.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
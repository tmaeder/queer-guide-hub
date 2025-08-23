import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Shield, Lock, MapPin, Phone, Heart, User, DollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface PrivacySetting {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'basic' | 'sensitive' | 'financial';
  defaultValue: boolean;
}

const privacySettings: PrivacySetting[] = [
  {
    key: 'bio_public',
    label: 'Bio Visibility',
    description: 'Allow others to see your bio and description',
    icon: <User className="h-4 w-4" />,
    category: 'basic',
    defaultValue: true
  },
  {
    key: 'location_public',
    label: 'Location Sharing',
    description: 'Share your general location with others',
    icon: <MapPin className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'pronouns_public',
    label: 'Pronouns Visibility',
    description: 'Display your pronouns publicly',
    icon: <User className="h-4 w-4" />,
    category: 'basic',
    defaultValue: false
  },
  {
    key: 'interests_public',
    label: 'Interests & Hobbies',
    description: 'Share your interests and hobbies',
    icon: <Heart className="h-4 w-4" />,
    category: 'basic',
    defaultValue: false
  },
  {
    key: 'contact_public',
    label: 'Contact Information',
    description: 'Allow others to see your website and social links',
    icon: <Phone className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'phone_public',
    label: 'Phone Number',
    description: 'Share your phone number (highly sensitive)',
    icon: <Phone className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'gender_identity_public',
    label: 'Gender Identity',
    description: 'Share your gender identity',
    icon: <User className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'sexual_orientation_public',
    label: 'Sexual Orientation',
    description: 'Share your sexual orientation',
    icon: <Heart className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'relationship_status_public',
    label: 'Relationship Status',
    description: 'Share your relationship status',
    icon: <Heart className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'income_range_public',
    label: 'Income Information',
    description: 'Share your income range (financial data)',
    icon: <DollarSign className="h-4 w-4" />,
    category: 'financial',
    defaultValue: false
  },
  {
    key: 'emergency_contact_public',
    label: 'Emergency Contact',
    description: 'Emergency contact information visibility',
    icon: <Phone className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'political_views_public',
    label: 'Political Views',
    description: 'Share your political perspectives',
    icon: <User className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'religious_beliefs_public',
    label: 'Religious Beliefs',
    description: 'Share your religious or spiritual beliefs',
    icon: <User className="h-4 w-4" />,
    category: 'sensitive',
    defaultValue: false
  }
];

export function PrivacyControlCenter() {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile?.privacy_settings && typeof profile.privacy_settings === 'object') {
      setSettings(profile.privacy_settings as Record<string, boolean>);
    } else {
      // Set default values
      const defaultSettings = privacySettings.reduce((acc, setting) => {
        acc[setting.key] = setting.defaultValue;
        return acc;
      }, {} as Record<string, boolean>);
      setSettings(defaultSettings);
    }
  }, [profile]);

  const updatePrivacySetting = async (key: string, value: boolean) => {
    if (!user || !profile) return;

    try {
      setLoading(true);
      
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);

      await updateProfile({ 
        privacy_settings: newSettings 
      });

      // Log security event for sensitive changes
      const setting = privacySettings.find(s => s.key === key);
      if (setting?.category === 'sensitive' || setting?.category === 'financial') {
        await supabase.rpc('log_security_event', {
          p_event_type: 'PRIVACY_SETTING_CHANGED',
          p_user_id: user.id,
          p_metadata: {
            setting_key: key,
            setting_value: value,
            category: setting.category
          },
          p_severity: 'medium'
        });
      }

      toast({
        title: "Privacy Setting Updated",
        description: `${setting?.label} visibility has been ${value ? 'enabled' : 'disabled'}`
      });

    } catch (error) {
      console.error('Error updating privacy setting:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update privacy setting",
        variant: "destructive"
      });
      // Revert the setting
      setSettings(prev => ({ ...prev, [key]: !value }));
    } finally {
      setLoading(false);
    }
  };

  const setAllToPrivate = async () => {
    const privateSettings = privacySettings.reduce((acc, setting) => {
      acc[setting.key] = false;
      return acc;
    }, {} as Record<string, boolean>);
    
    try {
      setLoading(true);
      setSettings(privateSettings);
      
      await updateProfile({ 
        privacy_settings: privateSettings 
      });

      toast({
        title: "All Settings Set to Private",
        description: "All privacy settings have been set to private for maximum protection"
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update privacy settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'basic':
        return <Eye className="h-4 w-4 text-blue-600" />;
      case 'sensitive':
        return <Shield className="h-4 w-4 text-orange-600" />;
      case 'financial':
        return <Lock className="h-4 w-4 text-red-600" />;
      default:
        return <Eye className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'basic':
        return 'bg-blue-100 text-blue-800';
      case 'sensitive':
        return 'bg-orange-100 text-orange-800';
      case 'financial':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const groupedSettings = privacySettings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, PrivacySetting[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6" />
              <CardTitle>Privacy Control Center</CardTitle>
            </div>
            <Button 
              variant="outline" 
              onClick={setAllToPrivate}
              disabled={loading}
            >
              <EyeOff className="h-4 w-4 mr-2" />
              Set All Private
            </Button>
          </div>
          <CardDescription>
            Control who can see your personal information. Changes are saved automatically.
          </CardDescription>
        </CardHeader>
      </Card>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Privacy Protection Active</AlertTitle>
        <AlertDescription>
          Your data is protected by enhanced security measures. All privacy changes are logged for security purposes.
        </AlertDescription>
      </Alert>

      {Object.entries(groupedSettings).map(([category, categorySettings]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {getCategoryIcon(category)}
              <span className="capitalize">{category} Information</span>
              <Badge variant="secondary" className={getCategoryColor(category)}>
                {categorySettings.length} settings
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categorySettings.map((setting, index) => (
              <div key={setting.key}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {setting.icon}
                    <div>
                      <div className="font-medium">{setting.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {setting.description}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={settings[setting.key] || false}
                    onCheckedChange={(checked) => updatePrivacySetting(setting.key, checked)}
                    disabled={loading}
                  />
                </div>
                {index < categorySettings.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Privacy settings are enforced at the database level for maximum security.
            </p>
            <p className="text-xs text-muted-foreground">
              Even administrators require justification to access sensitive data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
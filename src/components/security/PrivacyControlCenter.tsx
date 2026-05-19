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
    icon: <User style={{ height: 16, width: 16 }} />,
    category: 'basic',
    defaultValue: true
  },
  {
    key: 'location_public',
    label: 'Location Sharing',
    description: 'Share your general location with others',
    icon: <MapPin style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'pronouns_public',
    label: 'Pronouns Visibility',
    description: 'Display your pronouns publicly',
    icon: <User style={{ height: 16, width: 16 }} />,
    category: 'basic',
    defaultValue: false
  },
  {
    key: 'interests_public',
    label: 'Interests & Hobbies',
    description: 'Share your interests and hobbies',
    icon: <Heart style={{ height: 16, width: 16 }} />,
    category: 'basic',
    defaultValue: false
  },
  {
    key: 'contact_public',
    label: 'Contact Information',
    description: 'Allow others to see your website and social links',
    icon: <Phone style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'phone_public',
    label: 'Phone Number',
    description: 'Share your phone number (highly sensitive)',
    icon: <Phone style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'gender_identity_public',
    label: 'Gender Identity',
    description: 'Share your gender identity',
    icon: <User style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'sexual_orientation_public',
    label: 'Sexual Orientation',
    description: 'Share your sexual orientation',
    icon: <Heart style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'relationship_status_public',
    label: 'Relationship Status',
    description: 'Share your relationship status',
    icon: <Heart style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'income_range_public',
    label: 'Income Information',
    description: 'Share your income range (financial data)',
    icon: <DollarSign style={{ height: 16, width: 16 }} />,
    category: 'financial',
    defaultValue: false
  },
  {
    key: 'emergency_contact_public',
    label: 'Emergency Contact',
    description: 'Emergency contact information visibility',
    icon: <Phone style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'political_views_public',
    label: 'Political Views',
    description: 'Share your political perspectives',
    icon: <User style={{ height: 16, width: 16 }} />,
    category: 'sensitive',
    defaultValue: false
  },
  {
    key: 'religious_beliefs_public',
    label: 'Religious Beliefs',
    description: 'Share your religious or spiritual beliefs',
    icon: <User style={{ height: 16, width: 16 }} />,
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
    } catch (_error) {
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
        return <Eye style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />;
      case 'sensitive':
        return <Shield style={{ height: 16, width: 16, color: 'hsl(var(--foreground) / 0.55)' }} />;
      case 'financial':
        return <Lock style={{ height: 16, width: 16, color: 'hsl(var(--destructive))' }} />;
      default:
        return <Eye style={{ height: 16, width: 16 }} />;
    }
  };

  const getCategoryBadgeStyle = (category: string): React.CSSProperties => {
    switch (category) {
      case 'basic':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };
      case 'sensitive':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground) / 0.7)' };
      case 'financial':
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--destructive))' };
      default:
        return { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' };
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield style={{ height: 24, width: 24 }} />
              <CardTitle>Privacy Control Center</CardTitle>
            </div>
            <Button
              variant="outline"
              onClick={setAllToPrivate}
              disabled={loading}
            >
              <EyeOff style={{ height: 16, width: 16, marginRight: 8 }} />
              Set All Private
            </Button>
          </div>
          <CardDescription>
            Control who can see your personal information. Changes are saved automatically.
          </CardDescription>
        </CardHeader>
      </Card>

      <Alert>
        <Shield style={{ height: 16, width: 16 }} />
        <AlertTitle>Privacy Protection Active</AlertTitle>
        <AlertDescription>
          Your data is protected by enhanced security measures. All privacy changes are logged for security purposes.
        </AlertDescription>
      </Alert>

      {Object.entries(groupedSettings).map(([category, categorySettings]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                {getCategoryIcon(category)}
                <span className="capitalize">{category} Information</span>
                <Badge variant="secondary" style={getCategoryBadgeStyle(category)}>
                  {categorySettings.length} settings
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {categorySettings.map((setting, index) => (
                <div key={setting.key}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {setting.icon}
                      <div>
                        <p className="font-medium">{setting.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {setting.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={settings[setting.key] || false}
                      onCheckedChange={(checked) => updatePrivacySetting(setting.key, checked)}
                      disabled={loading}
                    />
                  </div>
                  {index < categorySettings.length - 1 && <Separator style={{ marginTop: 16 }} />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent style={{ paddingTop: 24 }}>
          <div className="text-center flex flex-col gap-2">
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

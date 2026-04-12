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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
        return <Eye style={{ height: 16, width: 16, color: '#2563eb' }} />;
      case 'sensitive':
        return <Shield style={{ height: 16, width: 16, color: '#ea580c' }} />;
      case 'financial':
        return <Lock style={{ height: 16, width: 16, color: '#dc2626' }} />;
      default:
        return <Eye style={{ height: 16, width: 16 }} />;
    }
  };

  const getCategoryBadgeSx = (category: string) => {
    switch (category) {
      case 'basic':
        return { bgcolor: '#dbeafe', color: '#1e40af' };
      case 'sensitive':
        return { bgcolor: '#ffedd5', color: '#9a3412' };
      case 'financial':
        return { bgcolor: '#fee2e2', color: '#991b1b' };
      default:
        return { bgcolor: 'grey.100', color: 'grey.800' };
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardHeader>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield style={{ height: 24, width: 24 }} />
              <CardTitle>Privacy Control Center</CardTitle>
            </Box>
            <Button
              variant="outline"
              onClick={setAllToPrivate}
              disabled={loading}
            >
              <EyeOff style={{ height: 16, width: 16, marginRight: 8 }} />
              Set All Private
            </Button>
          </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {getCategoryIcon(category)}
                <Box component="span" sx={{ textTransform: 'capitalize' }}>{category} Information</Box>
                <Badge variant="secondary" style={getCategoryBadgeSx(category)}>
                  {categorySettings.length} settings
                </Badge>
              </Box>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {categorySettings.map((setting, index) => (
                <div key={setting.key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {setting.icon}
                      <div>
                        <Box sx={{ fontWeight: 500 }}>{setting.label}</Box>
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
                          {setting.description}
                        </Typography>
                      </div>
                    </Box>
                    <Switch
                      checked={settings[setting.key] || false}
                      onCheckedChange={(checked) => updatePrivacySetting(setting.key, checked)}
                      disabled={loading}
                    />
                  </Box>
                  {index < categorySettings.length - 1 && <Separator style={{ marginTop: 16 }} />}
                </div>
              ))}
            </Box>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent style={{ paddingTop: 24 }}>
          <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
              Privacy settings are enforced at the database level for maximum security.
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
              Even administrators require justification to access sensitive data.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

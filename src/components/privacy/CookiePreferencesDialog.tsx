import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useCookieConsent, CookiePreferences } from '@/hooks/useCookieConsent';
import { Cookie, Shield, BarChart3, Target, Cog } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface CookiePreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CookiePreferencesDialog({ open, onOpenChange }: CookiePreferencesDialogProps) {
  const { preferences, updatePreferences, acceptAll, acceptNecessary } = useCookieConsent();
  const [localPreferences, setLocalPreferences] = useState<CookiePreferences>({
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    if (preferences) {
      setLocalPreferences(preferences);
    }
  }, [preferences]);

  const handleSave = () => {
    updatePreferences(localPreferences);
    onOpenChange(false);
  };

  const handleAcceptAll = () => {
    acceptAll();
    onOpenChange(false);
  };

  const handleNecessaryOnly = () => {
    acceptNecessary();
    onOpenChange(false);
  };

  const cookieCategories = [
    {
      id: 'necessary' as keyof CookiePreferences,
      icon: Shield,
      title: 'Necessary Cookies',
      description: 'Essential for the website to function properly. These cannot be disabled.',
      details: 'Authentication, session management, security features, and core functionality.',
      required: true,
    },
    {
      id: 'functional' as keyof CookiePreferences,
      icon: Cog,
      title: 'Functional Cookies',
      description: 'Enable enhanced functionality and personalization features.',
      details: 'Language preferences, theme settings, user interface customizations, and accessibility features.',
      required: false,
    },
    {
      id: 'analytics' as keyof CookiePreferences,
      icon: BarChart3,
      title: 'Analytics Cookies',
      description: 'Help us understand how visitors interact with our website.',
      details: 'Page views, navigation patterns, performance metrics, and error tracking to improve our service.',
      required: false,
    },
    {
      id: 'marketing' as keyof CookiePreferences,
      icon: Target,
      title: 'Marketing Cookies',
      description: 'Used to track visitors across websites for marketing purposes.',
      details: 'Advertising personalization, social media integration, and marketing campaign effectiveness.',
      required: false,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 672, maxHeight: '80vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cookie style={{ height: 20, width: 20 }} />
            Cookie Preferences
          </DialogTitle>
          <DialogDescription>
            Manage your cookie settings. You can enable or disable different types of cookies below.
            Changes will take effect immediately and be remembered for future visits.
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {cookieCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Box key={category.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                      <Label htmlFor={category.id} style={{ fontSize: '1rem', fontWeight: 500 }}>
                        {category.title}
                      </Label>
                      {category.required && (
                        <Typography component="span" sx={{ fontSize: '0.75rem', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>Required</Typography>
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {category.description}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {category.details}
                    </Typography>
                  </Box>
                  <Switch
                    id={category.id}
                    checked={localPreferences[category.id]}
                    onCheckedChange={(checked) => {
                      if (!category.required) {
                        setLocalPreferences(prev => ({
                          ...prev,
                          [category.id]: checked,
                        }));
                      }
                    }}
                    disabled={category.required}
                  />
                </Box>
                {category.id !== 'marketing' && <Separator />}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, pt: 2 }}>
          <Button onClick={handleSave} style={{ flex: 1 }}>
            Save Preferences
          </Button>
          <Button onClick={handleAcceptAll} variant="outline" style={{ flex: 1 }}>
            Accept All
          </Button>
          <Button onClick={handleNecessaryOnly} variant="ghost" style={{ flex: 1 }}>
            Necessary Only
          </Button>
        </Box>

        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          You can change these settings at any time from our Privacy Policy page.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}

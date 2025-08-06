import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useCookieConsent, CookiePreferences } from '@/hooks/useCookieConsent';
import { Cookie, Shield, BarChart3, Target, Cog } from 'lucide-react';

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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cookie className="h-5 w-5" />
            Cookie Preferences
          </DialogTitle>
          <DialogDescription>
            Manage your cookie settings. You can enable or disable different types of cookies below.
            Changes will take effect immediately and be remembered for future visits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {cookieCategories.map((category) => {
            const Icon = category.icon;
            return (
              <div key={category.id} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor={category.id} className="text-base font-medium">
                        {category.title}
                      </Label>
                      {category.required && (
                        <span className="text-xs bg-muted px-2 py-1 rounded">Required</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {category.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {category.details}
                    </p>
                  </div>
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
                </div>
                {category.id !== 'marketing' && <Separator />}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button onClick={handleSave} className="flex-1">
            Save Preferences
          </Button>
          <Button onClick={handleAcceptAll} variant="outline" className="flex-1">
            Accept All
          </Button>
          <Button onClick={handleNecessaryOnly} variant="ghost" className="flex-1">
            Necessary Only
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          You can change these settings at any time from our Privacy Policy page.
        </p>
      </DialogContent>
    </Dialog>
  );
}
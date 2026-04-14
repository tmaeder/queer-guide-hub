import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Save, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SocialLinksList } from './social/SocialLinksList';
import { PlatformSelector } from './social/PlatformSelector';
import { PLATFORM_CONFIGS } from './social/platformConfigs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SocialLink {
  platform: string;
  url: string;
  username?: string;
}

interface SocialLinksManagerProps {
  initialSocialLinks?: Record<string, unknown>;
  onUpdate?: (socialLinks: Record<string, unknown>) => void;
}

export function SocialLinksManager({ initialSocialLinks = {}, onUpdate }: SocialLinksManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(initialSocialLinks);
  const [customLinks, setCustomLinks] = useState<SocialLink[]>(
    Object.entries(initialSocialLinks).map(([platform, url]) => ({ platform, url: url as string })),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<string>('');

  // Auto-detect platform when URL changes
  useEffect(() => {
    if (quickAddUrl.trim()) {
      const detected = detectPlatformFromUrl(quickAddUrl);
      setDetectedPlatform(detected);
    } else {
      setDetectedPlatform('');
    }
  }, [quickAddUrl]);

  const detectPlatformFromUrl = (url: string): string => {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;

    for (const config of PLATFORM_CONFIGS) {
      try {
        const regexPattern = config.urlDetectionRegex
          .replace(/^\(\?i\)/, '')
          .replace(/\\\\/g, '\\');
        const regex = new RegExp(regexPattern, 'i');

        if (regex.test(cleanUrl)) {
          return config.platform;
        }
      } catch (_error) {
        continue;
      }
    }

    return 'Custom Platform';
  };

  const handleQuickAdd = async () => {
    if (!quickAddUrl.trim()) return;

    let url = quickAddUrl.trim();
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    const platform = detectPlatformFromUrl(url);

    const newLink: SocialLink = {
      platform,
      url,
    };
    setCustomLinks((prev) => [...prev, newLink]);

    setQuickAddUrl('');
    setDetectedPlatform('');

    toast({
      title: 'Platform added',
      description: `${platform} profile has been added successfully.`,
    });
  };

  const handleCustomLinkChange = (index: number, field: 'platform' | 'url', value: string) => {
    setCustomLinks((prev) => {
      const newLinks = [...prev];
      newLinks[index] = { ...newLinks[index], [field]: value };
      return newLinks;
    });
  };

  const removeCustomLink = (index: number) => {
    setCustomLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlatformAdd = (platform: string, url: string) => {
    const newLink: SocialLink = {
      platform,
      url: url === 'username' ? '' : url,
    };
    setCustomLinks((prev) => [...prev, newLink]);

    setShowPlatformSelector(false);
    toast({
      title: 'Platform added',
      description: `${platform} has been added to your profile.`,
    });
  };

  const saveSocialLinks = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const allSocialLinks = {
        ...Object.fromEntries(
          Object.entries(socialLinks).filter(([_, value]) => value.trim() !== ''),
        ),
        ...Object.fromEntries(customLinks.map((link) => [link.platform, link.url])),
      };

      const { error } = await supabase
        .from('profiles')
        .update({ social_links: allSocialLinks })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Social links updated',
        description: 'Your social media profiles have been saved.',
      });

      onUpdate?.(allSocialLinks);
    } catch (error) {
      console.error('Error saving social links:', error);
      toast({
        title: 'Error',
        description: 'Failed to save social links. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Globe style={{ width: 20, height: 20 }} />
            <Typography variant="h6">Social Media Profiles</Typography>
          </Box>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPlatformSelector(!showPlatformSelector)}
          >
            <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
            Add Platform
          </Button>
        </Box>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Quick Add URL Input */}
          <Box
            sx={{
              p: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 500 }}>
                Add Social Profile
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Input
                  placeholder="Paste any social media URL (e.g., https://twitter.com/username)"
                  value={quickAddUrl}
                  onChange={(e) => setQuickAddUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                  style={{ flex: 1 }}
                />
                <Button onClick={handleQuickAdd} disabled={!quickAddUrl.trim()}>
                  <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
                  Add
                </Button>
              </Box>
              {detectedPlatform && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Globe style={{ width: 16, height: 16 }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Detected: {detectedPlatform}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {showPlatformSelector && <PlatformSelector onPlatformSelect={handlePlatformAdd} />}

          <SocialLinksList
            customLinks={customLinks}
            onCustomLinkChange={handleCustomLinkChange}
            onRemoveCustomLink={removeCustomLink}
          />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
            <Button onClick={saveSocialLinks} disabled={isSaving}>
              <Save style={{ width: 16, height: 16, marginRight: 8 }} />
              {isSaving ? 'Saving...' : 'Save Social Links'}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

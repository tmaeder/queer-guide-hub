import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe, Save, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SocialLinksList } from './social/SocialLinksList';
import { PlatformSelector } from './social/PlatformSelector';
import { POPULAR_PLATFORMS } from './social/platformConfigs';

interface SocialLink {
  platform: string;
  url: string;
  username?: string;
}

interface SocialLinksManagerProps {
  initialSocialLinks?: Record<string, any>;
  onUpdate?: (socialLinks: Record<string, any>) => void;
}

export function SocialLinksManager({ initialSocialLinks = {}, onUpdate }: SocialLinksManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(initialSocialLinks);
  const [customLinks, setCustomLinks] = useState<SocialLink[]>(
    Object.entries(initialSocialLinks)
      .filter(([key]) => !POPULAR_PLATFORMS.some(p => p.platform.toLowerCase().replace(/\s/g, '') === key.toLowerCase()))
      .map(([platform, url]) => ({ platform, url: url as string }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);

  const handleSocialLinkChange = (platform: string, value: string) => {
    setSocialLinks(prev => ({
      ...prev,
      [platform]: value
    }));
  };

  const handleCustomLinkChange = (index: number, field: 'platform' | 'url', value: string) => {
    setCustomLinks(prev => {
      const newLinks = [...prev];
      newLinks[index] = { ...newLinks[index], [field]: value };
      return newLinks;
    });
  };

  const removeCustomLink = (index: number) => {
    setCustomLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handlePlatformAdd = (platform: string, url: string) => {
    const platformKey = platform.toLowerCase().replace(/\s/g, '');
    const isPopularPlatform = POPULAR_PLATFORMS.some(p => p.platform === platform);
    
    if (isPopularPlatform) {
      setSocialLinks(prev => ({
        ...prev,
        [platformKey]: url === 'username' ? '' : url
      }));
    } else {
      const newLink: SocialLink = {
        platform,
        url: url === 'username' ? '' : url
      };
      setCustomLinks(prev => [...prev, newLink]);
    }
    
    setShowPlatformSelector(false);
    toast({
      title: "Platform added",
      description: `${platform} has been added to your profile.`
    });
  };

  const saveSocialLinks = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const allSocialLinks = {
        ...Object.fromEntries(
          Object.entries(socialLinks).filter(([_, value]) => value.trim() !== '')
        ),
        ...Object.fromEntries(
          customLinks.map(link => [link.platform, link.url])
        )
      };

      const { error } = await supabase
        .from('profiles')
        .update({ social_links: allSocialLinks })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Social links updated",
        description: "Your social media profiles have been saved."
      });

      onUpdate?.(allSocialLinks);
    } catch (error) {
      console.error('Error saving social links:', error);
      toast({
        title: "Error",
        description: "Failed to save social links. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Social Media Profiles
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPlatformSelector(!showPlatformSelector)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Platform
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {showPlatformSelector && (
          <PlatformSelector onPlatformSelect={handlePlatformAdd} />
        )}
        
        <SocialLinksList
          socialLinks={socialLinks}
          customLinks={customLinks}
          onSocialLinkChange={handleSocialLinkChange}
          onCustomLinkChange={handleCustomLinkChange}
          onRemoveCustomLink={removeCustomLink}
        />

        <div className="flex justify-end pt-4">
          <Button 
            onClick={saveSocialLinks}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Social Links"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
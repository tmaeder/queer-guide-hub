import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Twitter, 
  Instagram, 
  Linkedin, 
  Github, 
  Facebook, 
  Youtube, 
  Globe, 
  Music,
  Save,
  Trash2,
  Plus
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SocialLink {
  platform: string;
  url: string;
  username?: string;
}

interface SocialLinksManagerProps {
  initialSocialLinks?: Record<string, any>;
  onUpdate?: (socialLinks: Record<string, any>) => void;
}

const SOCIAL_PLATFORMS = [
  { 
    key: 'twitter', 
    name: 'Twitter', 
    icon: Twitter, 
    urlPrefix: 'https://twitter.com/',
    placeholder: 'username'
  },
  { 
    key: 'instagram', 
    name: 'Instagram', 
    icon: Instagram, 
    urlPrefix: 'https://instagram.com/',
    placeholder: 'username'
  },
  { 
    key: 'linkedin', 
    name: 'LinkedIn', 
    icon: Linkedin, 
    urlPrefix: 'https://linkedin.com/in/',
    placeholder: 'profile-name'
  },
  { 
    key: 'github', 
    name: 'GitHub', 
    icon: Github, 
    urlPrefix: 'https://github.com/',
    placeholder: 'username'
  },
  { 
    key: 'facebook', 
    name: 'Facebook', 
    icon: Facebook, 
    urlPrefix: 'https://facebook.com/',
    placeholder: 'username'
  },
  { 
    key: 'youtube', 
    name: 'YouTube', 
    icon: Youtube, 
    urlPrefix: 'https://youtube.com/@',
    placeholder: 'channel'
  },
  { 
    key: 'tiktok', 
    name: 'TikTok', 
    icon: Music, 
    urlPrefix: 'https://tiktok.com/@',
    placeholder: 'username'
  },
  { 
    key: 'website', 
    name: 'Website', 
    icon: Globe, 
    urlPrefix: '',
    placeholder: 'https://yourwebsite.com'
  }
];

export function SocialLinksManager({ initialSocialLinks = {}, onUpdate }: SocialLinksManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(initialSocialLinks);
  const [customLinks, setCustomLinks] = useState<SocialLink[]>(
    Object.entries(initialSocialLinks)
      .filter(([key]) => !SOCIAL_PLATFORMS.some(p => p.key === key))
      .map(([platform, url]) => ({ platform, url: url as string }))
  );
  const [newCustomPlatform, setNewCustomPlatform] = useState('');
  const [newCustomUrl, setNewCustomUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSocialLinkChange = (platform: string, value: string) => {
    setSocialLinks(prev => ({
      ...prev,
      [platform]: value
    }));
  };

  const validateUrl = async (url: string): Promise<boolean> => {
    try {
      const apiKey = 'AIzaSyAkSfSrwIQGzVciKbClNYpL9YHPbHOj_Og';
      const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'lovable-social-validator', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'],
            platformTypes: ['WINDOWS'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: url }]
          }
        })
      });
      const data = await response.json();
      return !data.matches || data.matches.length === 0;
    } catch {
      return true; // Allow if validation fails
    }
  };

  const detectPlatform = (url: string): string => {
    const domain = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    
    const platformMap: Record<string, string> = {
      'twitter.com': 'Twitter',
      'x.com': 'Twitter',
      'instagram.com': 'Instagram',
      'facebook.com': 'Facebook',
      'linkedin.com': 'LinkedIn',
      'github.com': 'GitHub',
      'youtube.com': 'YouTube',
      'tiktok.com': 'TikTok',
      'snapchat.com': 'Snapchat',
      'pinterest.com': 'Pinterest',
      'discord.gg': 'Discord',
      'twitch.tv': 'Twitch',
      'reddit.com': 'Reddit'
    };

    for (const [domain_key, platform] of Object.entries(platformMap)) {
      if (domain.includes(domain_key)) return platform;
    }
    
    return 'Website';
  };

  const addCustomLink = async () => {
    if (!newCustomPlatform.trim() || !newCustomUrl.trim()) return;
    
    let url = newCustomUrl.trim();
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    const isValidUrl = await validateUrl(url);
    if (!isValidUrl) {
      toast({
        title: "Invalid URL",
        description: "The URL appears to be unsafe or invalid.",
        variant: "destructive"
      });
      return;
    }

    const detectedPlatform = detectPlatform(url);
    const finalPlatform = newCustomPlatform.trim() || detectedPlatform;
    
    const newLink: SocialLink = {
      platform: finalPlatform,
      url: url
    };
    
    setCustomLinks(prev => [...prev, newLink]);
    setNewCustomPlatform('');
    setNewCustomUrl('');
    
    toast({
      title: "Platform added",
      description: `${finalPlatform} profile has been added successfully.`
    });
  };

  const removeCustomLink = (index: number) => {
    setCustomLinks(prev => prev.filter((_, i) => i !== index));
  };

  const saveSocialLinks = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      // Combine standard social links with custom links
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

  const formatUrl = (platform: string, value: string) => {
    if (!value.trim()) return '';
    
    const platformConfig = SOCIAL_PLATFORMS.find(p => p.key === platform);
    if (!platformConfig) return value;
    
    // If it's a website and doesn't start with http, add https
    if (platform === 'website') {
      return value.startsWith('http') ? value : `https://${value}`;
    }
    
    // For other platforms, prepend the platform prefix if not already a full URL
    if (value.startsWith('http')) {
      return value;
    }
    
    return `${platformConfig.urlPrefix}${value}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Social Media Profiles
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Standard Social Platforms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SOCIAL_PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            return (
              <div key={platform.key} className="space-y-2">
                <Label 
                  htmlFor={platform.key}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {platform.name}
                </Label>
                <div className="flex">
                  {platform.key !== 'website' && (
                    <div className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-sm text-muted-foreground">
                      {platform.urlPrefix}
                    </div>
                  )}
                  <Input
                    id={platform.key}
                    placeholder={platform.placeholder}
                    value={socialLinks[platform.key] || ''}
                    onChange={(e) => handleSocialLinkChange(platform.key, e.target.value)}
                    className={platform.key !== 'website' ? 'rounded-l-none' : ''}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Links */}
        {customLinks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Custom Links</h4>
              {customLinks.map((link, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input 
                      value={link.platform} 
                      onChange={(e) => {
                        const newLinks = [...customLinks];
                        newLinks[index].platform = e.target.value;
                        setCustomLinks(newLinks);
                      }}
                      placeholder="Platform name"
                    />
                    <Input 
                      value={link.url} 
                      onChange={(e) => {
                        const newLinks = [...customLinks];
                        newLinks[index].url = e.target.value;
                        setCustomLinks(newLinks);
                      }}
                      placeholder="URL"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeCustomLink(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Add Custom Link */}
        <Separator />
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Add Custom Platform</h4>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Platform name"
              value={newCustomPlatform}
              onChange={(e) => setNewCustomPlatform(e.target.value)}
            />
            <Input
              placeholder="URL"
              value={newCustomUrl}
              onChange={(e) => setNewCustomUrl(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addCustomLink}
              disabled={!newCustomPlatform.trim() || !newCustomUrl.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button 
            onClick={saveSocialLinks}
            disabled={isSaving}
            className="bg-gradient-primary hover:opacity-90"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Social Links"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
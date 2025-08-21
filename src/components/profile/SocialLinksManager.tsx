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

interface PlatformConfig {
  category: string;
  platform: string;
  urlDetectionRegex: string;
  idValidationRegex: string;
  icon: React.ComponentType<any>;
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  // Social
  { category: 'Social', platform: 'Facebook', urlDetectionRegex: '(?i)^https?://(?:www\\.)?facebook\\.com/([A-Za-z0-9\\.]{5,})/?$', idValidationRegex: '(?i)^[A-Za-z0-9\\.]{5,}$', icon: Facebook },
  { category: 'Social', platform: 'Instagram', urlDetectionRegex: '(?i)^https?://(?:www\\.)?instagram\\.com/([a-z0-9._]{1,30})/?$', idValidationRegex: '(?i)^[a-z0-9._]{1,30}$', icon: Instagram },
  { category: 'Social', platform: 'X (Twitter)', urlDetectionRegex: '(?i)^https?://(?:www\\.)?(?:twitter|x)\\.com/([A-Za-z0-9_]{1,15})/?$', idValidationRegex: '^[A-Za-z0-9_]{1,15}$', icon: Twitter },
  { category: 'Social', platform: 'TikTok', urlDetectionRegex: '(?i)^https?://(?:www\\.)?tiktok\\.com/@([A-Za-z0-9._]{2,24})/?$', idValidationRegex: '(?i)^[A-Za-z0-9._]{2,24}$', icon: Music },
  { category: 'Social', platform: 'LinkedIn', urlDetectionRegex: '(?i)^https?://(?:www\\.)?linkedin\\.com/in/([A-Za-z0-9-]{5,30})/?$', idValidationRegex: '^[A-Za-z0-9-]{5,30}$', icon: Linkedin },
  { category: 'Social', platform: 'YouTube', urlDetectionRegex: '(?i)^https?://(?:www\\.)?youtube\\.com/@([A-Za-z0-9._-]{3,30})/?$', idValidationRegex: '(?i)^[A-Za-z0-9._-]{3,30}$', icon: Youtube },
  { category: 'Social', platform: 'GitHub', urlDetectionRegex: '(?i)^https?://(?:www\\.)?github\\.com/([A-Za-z0-9](?:-?[A-Za-z0-9]){0,38})/?$', idValidationRegex: '(?i)^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$', icon: Github },
  { category: 'Social', platform: 'Reddit', urlDetectionRegex: '(?i)^https?://(?:www\\.)?reddit\\.com/(?:u|user)/([A-Za-z0-9_]{3,20})/?$', idValidationRegex: '^[A-Za-z0-9_]{3,20}$', icon: Globe },
  { category: 'Social', platform: 'Discord', urlDetectionRegex: '(?i)^https?://(?:www\\.)?discord\\.com/users/(\\d{17,20})/?$', idValidationRegex: '^\\d{17,20}$', icon: Globe },
  { category: 'Social', platform: 'Telegram', urlDetectionRegex: '(?i)^https?://(?:t\\.me|telegram\\.me)/([A-Za-z0-9_]{5,32})/?$', idValidationRegex: '^[A-Za-z0-9_]{5,32}$', icon: Globe },
  { category: 'Social', platform: 'Threads', urlDetectionRegex: '(?i)^https?://(?:www\\.)?threads\\.net/@([A-Za-z0-9._]{1,30})/?$', idValidationRegex: '(?i)^[A-Za-z0-9._]{1,30}$', icon: Globe },
  { category: 'Social', platform: 'Snapchat', urlDetectionRegex: '(?i)^https?://(?:www\\.)?snapchat\\.com/(?:add|@)/([A-Za-z0-9_]{3,15})/?$', idValidationRegex: '^[A-Za-z0-9_]{3,15}$', icon: Globe },
  { category: 'Social', platform: 'Pinterest', urlDetectionRegex: '(?i)^https?://(?:www\\.)?pinterest\\.com/([A-Za-z0-9_-]{3,30})/?$', idValidationRegex: '^[A-Za-z0-9_-]{3,30}$', icon: Globe },
  { category: 'Social', platform: 'Twitch', urlDetectionRegex: '(?i)^https?://(?:www\\.)?twitch\\.tv/([A-Za-z0-9_]{4,25})/?$', idValidationRegex: '^[A-Za-z0-9_]{4,25}$', icon: Globe },
  { category: 'Social', platform: 'Medium', urlDetectionRegex: '(?i)^https?://(?:www\\.)?medium\\.com/@([A-Za-z0-9_\\.]{1,30})/?$', idValidationRegex: '(?i)^[A-Za-z0-9_\\.]{1,30}$', icon: Globe },
  { category: 'Social', platform: 'Mastodon', urlDetectionRegex: '(?i)^https?://([A-Za-z0-9.-]+\\.[A-Za-z]{2,})/@([A-Za-z0-9_\\.]{1,30})/?$', idValidationRegex: '(?i)^@?[A-Za-z0-9_\\.]{1,30}@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$', icon: Globe },
  { category: 'Social', platform: 'Bluesky', urlDetectionRegex: '(?i)^https?://(?:www\\.)?bsky\\.app/profile/([A-Za-z0-9.-]+\\.[A-Za-z]{2,})/?$', idValidationRegex: '(?i)^[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$', icon: Globe },
  
  // Music/Video
  { category: 'Music/Video', platform: 'Spotify', urlDetectionRegex: '(?i)^https?://open\\.spotify\\.com/(?:artist|user)/([0-9A-Za-z._-]{3,30})/?$', idValidationRegex: '^[0-9A-Za-z._-]{3,30}$', icon: Music },
  { category: 'Music/Video', platform: 'SoundCloud', urlDetectionRegex: '(?i)^https?://(?:www\\.)?soundcloud\\.com/([A-Za-z0-9_-]{3,25})/?$', idValidationRegex: '^[A-Za-z0-9_-]{3,25}$', icon: Music },
  { category: 'Music/Video', platform: 'Bandcamp', urlDetectionRegex: '(?i)^https?://([A-Za-z0-9-]{1,63})\\.bandcamp\\.com/?$', idValidationRegex: '^[A-Za-z0-9-]{1,63}$', icon: Music },
  
  // Queer/Dating
  { category: 'Queer/Dating', platform: 'Grindr', urlDetectionRegex: '(?i)^https?://(?:www\\.)?grindr\\.com/profile/([A-Za-z0-9]{8,15})/?$', idValidationRegex: '^[A-Za-z0-9]{8,15}$', icon: Globe },
  { category: 'Queer/Dating', platform: 'HER', urlDetectionRegex: '(?i)^https?://(?:www\\.)?weareher\\.com/profile/([A-Za-z0-9_-]{3,30})/?$', idValidationRegex: '^[A-Za-z0-9_-]{3,30}$', icon: Globe },
  { category: 'Queer/Dating', platform: 'Tinder', urlDetectionRegex: '(?i)^https?://(?:www\\.)?tinder\\.com/@?([A-Za-z0-9]{3,30})/?$', idValidationRegex: '^[A-Za-z0-9]{3,30}$', icon: Globe },
  
  // Adult/Creator  
  { category: 'Adult/Creator', platform: 'OnlyFans', urlDetectionRegex: '(?i)^https?://(?:www\\.)?onlyfans\\.com/([A-Za-z0-9._-]{3,50})/?$', idValidationRegex: '^[A-Za-z0-9._-]{3,50}$', icon: Globe },
  { category: 'Adult/Creator', platform: 'Patreon', urlDetectionRegex: '(?i)^https?://(?:www\\.)?patreon\\.com/([A-Za-z0-9_-]{3,100})/?$', idValidationRegex: '^[A-Za-z0-9_-]{3,100}$', icon: Globe },
  
  // Payments/Support
  { category: 'Payments/Support', platform: 'Ko-fi', urlDetectionRegex: '(?i)^https?://(?:www\\.)?ko-fi\\.com/([A-Za-z0-9_-]{3,30})/?$', idValidationRegex: '^[A-Za-z0-9_-]{3,30}$', icon: Globe },
  { category: 'Payments/Support', platform: 'Buy Me a Coffee', urlDetectionRegex: '(?i)^https?://(?:www\\.)?buymeacoffee\\.com/([A-Za-z0-9_-]{3,30})/?$', idValidationRegex: '^[A-Za-z0-9_-]{3,30}$', icon: Globe },
  { category: 'Payments/Support', platform: 'PayPal', urlDetectionRegex: '(?i)^https?://(?:www\\.)?paypal\\.me/([A-Za-z0-9._-]{1,60})/?$', idValidationRegex: '^[A-Za-z0-9._-]{1,60}$', icon: Globe },
  
  // Website
  { category: 'General', platform: 'Website', urlDetectionRegex: '(?i)^https?://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/?.*$', idValidationRegex: '^https?://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/?.*$', icon: Globe }
];

const POPULAR_PLATFORMS = PLATFORM_CONFIGS.filter(p => 
  ['Facebook', 'Instagram', 'X (Twitter)', 'TikTok', 'LinkedIn', 'YouTube', 'GitHub', 'Website'].includes(p.platform)
);

export function SocialLinksManager({ initialSocialLinks = {}, onUpdate }: SocialLinksManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(initialSocialLinks);
  const [customLinks, setCustomLinks] = useState<SocialLink[]>(
    Object.entries(initialSocialLinks)
      .filter(([key]) => !POPULAR_PLATFORMS.some(p => p.platform.toLowerCase() === key.toLowerCase()))
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

  const validatePlatformUrl = (url: string, platformConfig?: PlatformConfig): boolean => {
    if (!platformConfig) return false;
    
    try {
      // JavaScript doesn't support (?i) flag directly, so we'll use the 'i' flag
      const regexPattern = platformConfig.urlDetectionRegex
        .replace(/^\(\?\i\)/, '')  // Remove (?i) prefix
        .replace(/\\\\/g, '\\');   // Fix double escaping
      
      const regex = new RegExp(regexPattern, 'i');
      return regex.test(url);
    } catch (error) {
      console.warn('Invalid regex pattern for platform:', platformConfig.platform);
      return false;
    }
  };

  const detectAndValidatePlatform = (url: string): { platform: string; isValid: boolean; config?: PlatformConfig } => {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // Try to match against all platform configurations
    for (const config of PLATFORM_CONFIGS) {
      if (validatePlatformUrl(cleanUrl, config)) {
        return { platform: config.platform, isValid: true, config };
      }
    }
    
    // Fallback for unknown platforms
    return { platform: 'Website', isValid: true };
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

    const { platform: detectedPlatform } = detectAndValidatePlatform(url);
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
    
    const platformConfig = PLATFORM_CONFIGS.find(p => p.platform.toLowerCase() === platform.toLowerCase());
    if (!platformConfig) return value;
    
    // If it's a website and doesn't start with http, add https
    if (platform.toLowerCase() === 'website') {
      return value.startsWith('http') ? value : `https://${value}`;
    }
    
    // For other platforms, validate and format the URL
    if (value.startsWith('http')) {
      return value;
    }
    
    // Basic URL formatting based on platform
    return value;
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
          {POPULAR_PLATFORMS.map((platformConfig) => {
            const Icon = platformConfig.icon;
            const platformKey = platformConfig.platform.toLowerCase().replace(/\s/g, '');
            return (
              <div key={platformKey} className="space-y-2">
                <Label 
                  htmlFor={platformKey}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {platformConfig.platform}
                </Label>
                <div className="flex">
                  {platformConfig.platform !== 'Website' && (
                    <div className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-sm text-muted-foreground">
                      {platformConfig.platform.toLowerCase()}.com/
                    </div>
                  )}
                  <Input
                    id={platformKey}
                    placeholder={platformConfig.platform !== 'Website' ? 'username' : 'https://yourwebsite.com'}
                    value={socialLinks[platformKey] || ''}
                    onChange={(e) => handleSocialLinkChange(platformKey, e.target.value)}
                    className={platformConfig.platform !== 'Website' ? 'rounded-l-none' : ''}
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
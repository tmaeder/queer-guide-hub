import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Trash2, ExternalLink, Check, X } from 'lucide-react';
import { POPULAR_PLATFORMS } from './platformConfigs';

interface SocialLink {
  platform: string;
  url: string;
  username?: string;
}

interface SocialLinksListProps {
  socialLinks: Record<string, string>;
  customLinks: SocialLink[];
  onSocialLinkChange: (platform: string, value: string) => void;
  onCustomLinkChange: (index: number, field: 'platform' | 'url', value: string) => void;
  onRemoveCustomLink: (index: number) => void;
  onValidateUrl?: (url: string) => Promise<boolean>;
}

export function SocialLinksList({
  socialLinks,
  customLinks,
  onSocialLinkChange,
  onCustomLinkChange,
  onRemoveCustomLink,
  onValidateUrl
}: SocialLinksListProps) {
  const validateAndPreview = async (url: string) => {
    if (onValidateUrl) {
      const isValid = await onValidateUrl(url);
      return isValid;
    }
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Popular Platforms */}
      <div>
        <h3 className="text-lg font-medium mb-4">Popular Platforms</h3>
        {POPULAR_PLATFORMS.map((platformConfig) => {
            const Icon = platformConfig.icon;
            const platformKey = platformConfig.platform.toLowerCase().replace(/\s/g, '');
            const currentValue = socialLinks[platformKey] || '';
            
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
                    value={currentValue}
                    onChange={(e) => onSocialLinkChange(platformKey, e.target.value)}
                    className={platformConfig.platform !== 'Website' ? 'rounded-l-none' : ''}
                  />
                  {currentValue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      onClick={() => {
                        const url = platformConfig.platform === 'Website' 
                          ? currentValue.startsWith('http') ? currentValue : `https://${currentValue}`
                          : `https://${platformConfig.platform.toLowerCase()}.com/${currentValue}`;
                        window.open(url, '_blank');
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Custom Links */}
      {customLinks.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Custom Links</h3>
            <div className="space-y-3">
              {customLinks.map((link, index) => (
                <div key={index} className="p-4 border rounded-lg bg-card">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Platform</Label>
                          <Input 
                            value={link.platform} 
                            onChange={(e) => onCustomLinkChange(index, 'platform', e.target.value)}
                            placeholder="Platform name"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>URL</Label>
                          <div className="flex">
                            <Input 
                              value={link.url} 
                              onChange={(e) => onCustomLinkChange(index, 'url', e.target.value)}
                              placeholder="https://platform.com/username"
                              className="flex-1"
                            />
                            {link.url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-2"
                                onClick={() => window.open(link.url, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveCustomLink(index)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
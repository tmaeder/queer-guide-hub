import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, ExternalLink } from 'lucide-react';

interface SocialLink {
  platform: string;
  url: string;
  username?: string;
}

interface SocialLinksListProps {
  socialLinks?: Record<string, string>;
  customLinks: SocialLink[];
  onSocialLinkChange?: (platform: string, value: string) => void;
  onCustomLinkChange: (index: number, field: 'platform' | 'url', value: string) => void;
  onRemoveCustomLink: (index: number) => void;
  onValidateUrl?: (url: string) => Promise<boolean>;
}

export function SocialLinksList({
  customLinks,
  onCustomLinkChange,
  onRemoveCustomLink,
  _onValidateUrl,
}: SocialLinksListProps) {
  return (
    <div className="flex flex-col gap-6">
      {customLinks.length > 0 && (
        <div className="flex flex-col gap-4">
          <h6 className="text-base font-medium">Social Links</h6>
          <div className="flex flex-col gap-3">
            {customLinks.map((link, index) => (
              <div key={index} className="p-4 bg-background">
                <div className="flex items-start gap-3">
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <Label>Platform</Label>
                        <Input
                          value={link.platform}
                          onChange={(e) => onCustomLinkChange(index, 'platform', e.target.value)}
                          placeholder="Platform name"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label>URL</Label>
                        <div className="flex">
                          <Input
                            value={link.url}
                            onChange={(e) => onCustomLinkChange(index, 'url', e.target.value)}
                            placeholder="https://platform.com/username"
                          />
                          {link.url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(link.url, '_blank')}
                            >
                              <ExternalLink style={{ height: 16, width: 16 }} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onRemoveCustomLink(index)}>
                    <Trash2 style={{ height: 16, width: 16 }} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

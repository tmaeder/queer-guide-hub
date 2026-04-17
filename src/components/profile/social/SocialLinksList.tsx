import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, ExternalLink } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  _socialLinks,
  customLinks,
  _onSocialLinkChange,
  onCustomLinkChange,
  onRemoveCustomLink,
  onValidateUrl
}: SocialLinksListProps) {
  const _validateAndPreview = async (url: string) => {
    if (onValidateUrl) {
      const isValid = await onValidateUrl(url);
      return isValid;
    }
    return true;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Social Links */}
      {customLinks.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>Social Links</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {customLinks.map((link, index) => (
              <Box key={index} sx={{ p: 2, bgcolor: 'background.paper' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Label>Platform</Label>
                        <Input
                          value={link.platform}
                          onChange={(e) => onCustomLinkChange(index, 'platform', e.target.value)}
                          placeholder="Platform name"
                        />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Label>URL</Label>
                        <Box sx={{ display: 'flex' }}>
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
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveCustomLink(index)}

                  >
                    <Trash2 style={{ height: 16, width: 16 }} />
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
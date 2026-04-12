import {
  Twitter,
  Instagram,
  Linkedin,
  Github,
  Facebook,
  Youtube,
  Globe,
  Music,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';

interface _SocialLink {
  platform: string;
  url: string;
}

interface SocialLinksDisplayProps {
  socialLinks: Record<string, unknown>;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PLATFORM_CONFIGS = {
  twitter: { name: 'Twitter', icon: Twitter },
  instagram: { name: 'Instagram', icon: Instagram },
  linkedin: { name: 'LinkedIn', icon: Linkedin },
  github: { name: 'GitHub', icon: Github },
  facebook: { name: 'Facebook', icon: Facebook },
  youtube: { name: 'YouTube', icon: Youtube },
  tiktok: { name: 'TikTok', icon: Music },
  website: { name: 'Website', icon: Globe }
};

export function SocialLinksDisplay({ socialLinks, showLabels = false, size = 'md' }: SocialLinksDisplayProps) {
  if (!socialLinks || Object.keys(socialLinks).length === 0) {
    return null;
  }

  const iconSizeMap = {
    sm: { width: 16, height: 16 },
    md: { width: 20, height: 20 },
    lg: { width: 24, height: 24 }
  };

  const iconStyle = iconSizeMap[size];

  const formatUrl = (url: string) => {
    if (!url.startsWith('http')) {
      return `https://${url}`;
    }
    return url;
  };

  const getSocialIcon = (platform: string, url: string) => {
    const config = PLATFORM_CONFIGS[platform.toLowerCase() as keyof typeof PLATFORM_CONFIGS];

    if (config) {
      const Icon = config.icon;
      return (
        <Button
          variant="outline"
          size={size === 'sm' ? 'sm' : 'default'}
          asChild
        >
          <a
            href={formatUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            title={showLabels ? undefined : config.name}
          >
            <Icon style={iconStyle} />
            {showLabels && (
              <>
                <Box component="span" sx={{ ml: 1 }}>{config.name}</Box>
                <ExternalLink style={{ width: 12, height: 12, marginLeft: 4 }} />
              </>
            )}
          </a>
        </Button>
      );
    }

    // Custom platform
    return (
      <Button
        variant="outline"
        size={size === 'sm' ? 'sm' : 'default'}
        asChild
      >
        <a
          href={formatUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          title={showLabels ? undefined : platform}
        >
          <Globe style={iconStyle} />
          {showLabels && (
            <>
              <Box component="span" sx={{ ml: 1 }}>{platform}</Box>
              <ExternalLink style={{ width: 12, height: 12, marginLeft: 4 }} />
            </>
          )}
        </a>
      </Button>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ...(showLabels && { flexDirection: 'column' }) }}>
      {Object.entries(socialLinks).map(([platform, url]) => {
        if (!url || typeof url !== 'string') return null;

        return (
          <Box key={platform}>
            {getSocialIcon(platform, url)}
          </Box>
        );
      })}
    </Box>
  );
}

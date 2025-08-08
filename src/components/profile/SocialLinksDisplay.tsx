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

interface SocialLink {
  platform: string;
  url: string;
}

interface SocialLinksDisplayProps {
  socialLinks: Record<string, any>;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PLATFORM_CONFIGS = {
  twitter: { name: 'Twitter', icon: Twitter, color: 'text-foreground' },
  instagram: { name: 'Instagram', icon: Instagram, color: 'text-foreground' },
  linkedin: { name: 'LinkedIn', icon: Linkedin, color: 'text-foreground' },
  github: { name: 'GitHub', icon: Github, color: 'text-foreground' },
  facebook: { name: 'Facebook', icon: Facebook, color: 'text-foreground' },
  youtube: { name: 'YouTube', icon: Youtube, color: 'text-foreground' },
  tiktok: { name: 'TikTok', icon: Music, color: 'text-foreground' },
  website: { name: 'Website', icon: Globe, color: 'text-foreground' }
};

export function SocialLinksDisplay({ socialLinks, showLabels = false, size = 'md' }: SocialLinksDisplayProps) {
  if (!socialLinks || Object.keys(socialLinks).length === 0) {
    return null;
  }

  const iconSize = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }[size];

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
          className={`${config.color} hover:${config.color} border-current`}
        >
          <a 
            href={formatUrl(url)} 
            target="_blank" 
            rel="noopener noreferrer"
            title={showLabels ? undefined : config.name}
          >
            <Icon className={iconSize} />
            {showLabels && (
              <>
                <span className="ml-2">{config.name}</span>
                <ExternalLink className="h-3 w-3 ml-1" />
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
        className="text-muted-foreground hover:text-foreground"
      >
        <a 
          href={formatUrl(url)} 
          target="_blank" 
          rel="noopener noreferrer"
          title={showLabels ? undefined : platform}
        >
          <Globe className={iconSize} />
          {showLabels && (
            <>
              <span className="ml-2">{platform}</span>
              <ExternalLink className="h-3 w-3 ml-1" />
            </>
          )}
        </a>
      </Button>
    );
  };

  return (
    <div className={`flex flex-wrap gap-2 ${showLabels ? 'flex-col' : ''}`}>
      {Object.entries(socialLinks).map(([platform, url]) => {
        if (!url || typeof url !== 'string') return null;
        
        return (
          <div key={platform}>
            {getSocialIcon(platform, url)}
          </div>
        );
      })}
    </div>
  );
}
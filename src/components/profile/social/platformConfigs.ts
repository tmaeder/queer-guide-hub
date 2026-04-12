import { 
  Facebook, 
  Instagram, 
  Linkedin, 
  Github, 
  Youtube, 
  Twitter, 
  Music,
  Globe
} from 'lucide-react';

export interface PlatformConfig {
  category: string;
  platform: string;
  urlDetectionRegex: string;
  idValidationRegex: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
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

export const POPULAR_PLATFORMS = PLATFORM_CONFIGS.filter(p => 
  ['Facebook', 'Instagram', 'X (Twitter)', 'TikTok', 'LinkedIn', 'YouTube', 'GitHub', 'Website'].includes(p.platform)
);
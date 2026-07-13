import { Globe, Music, Send, MessageCircle, Tv, Coffee, Heart, Flame, Video, ShoppingBag } from 'lucide-react';
import {
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  TikTok,
  Threads,
  Bluesky,
  Mastodon,
  Spotify,
  Github,
  Linkedin,
} from '@/components/icons/brand';
import type { SocialPlatformKey } from './registry';

type IconComponent = React.ComponentType<{ size?: number; width?: number; height?: number; className?: string }>;

/** Maps a registry platform key to a brand/lucide icon. Globe is the fallback. */
export const PLATFORM_ICONS: Record<SocialPlatformKey, IconComponent> = {
  instagram: Instagram,
  facebook: Facebook,
  twitter: Twitter,
  tiktok: TikTok,
  youtube: Youtube,
  linkedin: Linkedin,
  threads: Threads,
  bluesky: Bluesky,
  mastodon: Mastodon,
  telegram: Send,
  github: Github,
  reddit: MessageCircle,
  twitch: Tv,
  spotify: Spotify,
  soundcloud: Music,
  pinterest: Globe,
  snapchat: Globe,
  discord: MessageCircle,
  medium: Globe,
  patreon: Globe,
  kofi: Coffee,
  onlyfans: Heart,
  fansly: Heart,
  fetlife: Flame,
  joyclub: Flame,
  romeo: Flame,
  grindr: Flame,
  scruff: Flame,
  recon: Flame,
  pornhub: Video,
  xhamster: Video,
  xtube: Video,
  shop: ShoppingBag,
  website: Globe,
};

export function platformIcon(key: string): IconComponent {
  return PLATFORM_ICONS[key as SocialPlatformKey] ?? Globe;
}

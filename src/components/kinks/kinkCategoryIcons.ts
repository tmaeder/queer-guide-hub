import type { ComponentType } from 'react';
import {
  ArrowDownToLine,
  Circle,
  Crown,
  Drama,
  Droplets,
  Eye,
  Flame,
  Hand,
  Heart,
  Layers,
  Link,
  MessageCircle,
  Plug,
  Shield,
  Shirt,
  Sparkles,
  Timer,
  User,
  Users,
  Zap,
} from '@/components/icons';

type IconType = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

/** One mark per checklist category (kink_categories.slug). Unknown slugs get none. */
export const KINK_CATEGORY_ICONS: Partial<Record<string, IconType>> = {
  'affection-romance': Heart,
  'bodies-attraction': User,
  'clothing-gear': Shirt,
  'oral-hands': Hand,
  penetration: ArrowDownToLine,
  'anal-play': Circle,
  'bondage-restraints': Link,
  'impact-play': Zap,
  'pain-intensity': Flame,
  'sensation-tease': Sparkles,
  'power-dynamics': Crown,
  'cnc-scenarios': Shield,
  'verbal-play': MessageCircle,
  'voyeur-exhib': Eye,
  'group-social': Users,
  'fluids-mess': Droplets,
  'toys-tech': Plug,
  'orgasm-control': Timer,
  'roleplay-fantasy': Drama,
  'materials-fetish': Layers,
};

import {
  MapPin,
  Calendar,
  Globe,
  Store,
  Newspaper,
  Map,
  Rss,
  UsersRound,
  UserCheck,
  Tags,
  Plane,
  Users,
  Building,
  LifeBuoy,
  Heart,
  Smile,
  Handshake,
  Home,
  Settings,
  Mail,
  MessageCircle,
  Luggage,
  Footprints,
  Puzzle,
  Info,
  Accessibility,
  Scale,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for site navigation. Both the header and the search
 * "discovery hub" (SearchPopoverEmpty) read from here so the menu and search
 * never drift apart.
 */

export type NavCluster = 'places' | 'community' | 'shop' | 'support';

export interface NavDestination {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  cluster: NavCluster;
  /** Maps to a searchTaxonomy id when the destination is 1:1 with an index. */
  searchType?: string;
  /** Surfaced in the desktop primary nav row (vs. secondary). */
  primary?: boolean;
}

/** Ordered clusters for the discovery hub's "go to" sections. */
export const NAV_CLUSTERS: { id: NavCluster; labelKey: string }[] = [
  { id: 'places', labelKey: 'header.clusters.places' },
  { id: 'community', labelKey: 'header.clusters.community' },
  { id: 'shop', labelKey: 'header.clusters.shop' },
  { id: 'support', labelKey: 'header.clusters.support' },
];

/** All 14 destinations. Array order is preserved within each cluster/primary view. */
export const DESTINATIONS: NavDestination[] = [
  { to: '/venues', icon: MapPin, labelKey: 'header.nav.venues', cluster: 'places', searchType: 'venue', primary: true },
  { to: '/events', icon: Calendar, labelKey: 'header.nav.events', cluster: 'community', searchType: 'event', primary: true },
  { to: '/places', icon: Globe, labelKey: 'header.nav.places', cluster: 'places', primary: true },
  { to: '/marketplace', icon: Store, labelKey: 'header.nav.marketplace', cluster: 'shop', searchType: 'marketplace', primary: true },
  { to: '/news', icon: Newspaper, labelKey: 'header.nav.news', cluster: 'shop', searchType: 'news', primary: true },
  { to: '/map', icon: Map, labelKey: 'header.nav.map', cluster: 'places' },
  { to: '/community/feed', icon: Rss, labelKey: 'header.nav.feed', cluster: 'community' },
  { to: '/community/groups', icon: UsersRound, labelKey: 'header.nav.groups', cluster: 'community' },
  { to: '/community/members', icon: UserCheck, labelKey: 'header.nav.members', cluster: 'community' },
  { to: '/resources', icon: Tags, labelKey: 'header.nav.resources', cluster: 'shop' },
  { to: '/travel', icon: Plane, labelKey: 'header.nav.travel', cluster: 'places' },
  { to: '/personalities', icon: Users, labelKey: 'header.nav.personalities', cluster: 'community', searchType: 'personality' },
  { to: '/hotels', icon: Building, labelKey: 'header.nav.hotels', cluster: 'places' },
  { to: '/help', icon: LifeBuoy, labelKey: 'header.nav.help', cluster: 'support' },
];

/** Desktop primary nav row (5) and the secondary "More" set (9). */
export const PRIMARY_NAV = DESTINATIONS.filter((d) => d.primary);
export const MORE_NAV = DESTINATIONS.filter((d) => !d.primary);

export interface NavItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
}

export const USER_MENU_ITEMS: NavItem[] = [
  { to: '/me/trips', icon: Luggage, labelKey: 'header.userMenu.myTrips' },
  { to: '/me/saved', icon: Heart, labelKey: 'header.userMenu.favorites' },
  { to: '/profile/footprint', icon: Footprints, labelKey: 'header.userMenu.footprint' },
  { to: '/messages', icon: MessageCircle, labelKey: 'header.userMenu.messages' },
  { to: '/community/friends', icon: Users, labelKey: 'header.userMenu.friends' },
  { to: '/community/groups?tab=mine', icon: UsersRound, labelKey: 'header.userMenu.myGroups' },
  { to: '/profile/settings', icon: Settings, labelKey: 'header.userMenu.settings' },
  { to: '/mailbox', icon: Mail, labelKey: 'header.userMenu.mailbox' },
  { to: '/extension', icon: Puzzle, labelKey: 'header.userMenu.extension' },
];

export const USER_MODE_VALUES = [
  'dating',
  'friends',
  'exploration',
  'fun',
  'networking',
  'community',
] as const;

export type UserMode = (typeof USER_MODE_VALUES)[number];

export const USER_MODES: { value: UserMode; icon: LucideIcon; labelKey: string }[] = [
  { value: 'dating', icon: Heart, labelKey: 'header.modes.dating' },
  { value: 'friends', icon: Users, labelKey: 'header.modes.friends' },
  { value: 'exploration', icon: Map, labelKey: 'header.modes.exploration' },
  { value: 'fun', icon: Smile, labelKey: 'header.modes.fun' },
  { value: 'networking', icon: Handshake, labelKey: 'header.modes.networking' },
  { value: 'community', icon: Home, labelKey: 'header.modes.community' },
];

export const LEGAL_ITEMS: NavItem[] = [
  { to: '/about', icon: Info, labelKey: 'header.legal.about' },
  { to: '/help', icon: LifeBuoy, labelKey: 'header.legal.help' },
  { to: '/accessibility', icon: Accessibility, labelKey: 'header.legal.accessibility' },
  { to: '/legal', icon: Scale, labelKey: 'header.legal.legal' },
  { to: '/contact', icon: Mail, labelKey: 'header.legal.contact' },
];

/**
 * Ordered search-scope preference per user mode. The first entries drive the
 * discovery hub's trending tiles; the full ordering can bias scope display.
 * Values are searchTaxonomy ids.
 */
export const MODE_SCOPE_BIAS: Record<UserMode, string[]> = {
  dating: ['personality', 'venue', 'event'],
  friends: ['personality', 'event', 'venue'],
  exploration: ['city', 'queer_village', 'venue'],
  fun: ['event', 'venue', 'marketplace'],
  networking: ['event', 'personality', 'venue'],
  community: ['event', 'venue', 'news'],
};

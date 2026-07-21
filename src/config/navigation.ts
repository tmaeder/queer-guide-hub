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
  Puzzle,
  Info,
  Accessibility,
  Scale,
  Compass,
  MessageCircle,
  User,
  History,
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
  { to: '/people', icon: UserCheck, labelKey: 'header.nav.people', cluster: 'community', primary: true },
  { to: '/events', icon: Calendar, labelKey: 'header.nav.events', cluster: 'community', searchType: 'event', primary: true },
  { to: '/places', icon: Globe, labelKey: 'header.nav.places', cluster: 'places', primary: true },
  { to: '/marketplace', icon: Store, labelKey: 'header.nav.marketplace', cluster: 'shop', searchType: 'marketplace', primary: true },
  { to: '/news', icon: Newspaper, labelKey: 'header.nav.news', cluster: 'shop', searchType: 'news', primary: true },
  { to: '/map', icon: Map, labelKey: 'header.nav.map', cluster: 'places' },
  { to: '/community/feed', icon: Rss, labelKey: 'header.nav.feed', cluster: 'community' },
  { to: '/community/groups', icon: UsersRound, labelKey: 'header.nav.groups', cluster: 'community' },
  { to: '/community/members', icon: UserCheck, labelKey: 'header.nav.members', cluster: 'community' },
  { to: '/tags', icon: Tags, labelKey: 'header.nav.tags', cluster: 'shop' },
  { to: '/travel', icon: Plane, labelKey: 'header.nav.travel', cluster: 'places' },
  { to: '/personalities', icon: Users, labelKey: 'header.nav.personalities', cluster: 'community', searchType: 'personality' },
  { to: '/history', icon: History, labelKey: 'header.nav.history', cluster: 'community', searchType: 'milestone' },
  { to: '/hotels', icon: Building, labelKey: 'header.nav.hotels', cluster: 'places' },
  { to: '/help', icon: LifeBuoy, labelKey: 'header.nav.help', cluster: 'support' },
];

/** Desktop primary nav row (5) and the secondary "More" set (9). */
export const PRIMARY_NAV = DESTINATIONS.filter((d) => d.primary);
export const MORE_NAV = DESTINATIONS.filter((d) => !d.primary);

/**
 * Mobile bottom-nav tab set — single source of truth for the four destination
 * slots (the raised contribute button is bespoke and not listed here). Tapping
 * Explore deep-links to discovery (`/search`); the full destination hub is
 * reached by long-pressing Explore (or its chevron affordance), not a slot.
 */
export interface BottomNavTab {
  id: 'home' | 'explore' | 'hub' | 'you';
  to: string;
  icon: LucideIcon;
  labelKey: string;
  /** Locale-stripped prefixes that light this tab. '/' is matched exactly. */
  activePrefixes: string[];
  /** Anonymous tap routes to /auth with a return-to instead of navigating. */
  authGated?: boolean;
  /** Source for the tab's count badge. */
  badge?: 'unread';
  /** Render the signed-in avatar in place of the icon. */
  avatar?: boolean;
}

export const BOTTOM_NAV_TABS: BottomNavTab[] = [
  { id: 'home', to: '/', icon: Home, labelKey: 'header.mobileNav.home', activePrefixes: ['/'] },
  {
    id: 'explore',
    to: '/search',
    icon: Compass,
    labelKey: 'header.mobileNav.explore',
    // Any browse/discovery route lights Explore — "you're in the catalogue".
    activePrefixes: [
      '/search',
      '/venues',
      '/events',
      '/places',
      '/marketplace',
      '/news',
      '/map',
      '/people',
      '/hotels',
      '/travel',
      '/resources',
      '/personalities',
      '/history',
      '/community',
      '/feed',
      '/groups',
      '/users',
      '/friends',
    ],
  },
  {
    id: 'hub',
    to: '/hub',
    icon: MessageCircle,
    labelKey: 'header.mobileNav.hub',
    // Old /messages and /me both redirect into /hub — keep them lighting this tab.
    activePrefixes: ['/hub', '/messages', '/me'],
    authGated: true,
    badge: 'unread',
  },
  {
    // Own public profile — MobileBottomNav swaps the destination to
    // /user/<id> for signed-in users ('/me' is the anon gate fallback).
    id: 'you',
    to: '/me',
    icon: User,
    labelKey: 'header.mobileNav.you',
    activePrefixes: ['/profile', '/user'],
    authGated: true,
    avatar: true,
  },
];

export interface NavItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
}

// Account-scoped rows only. Navigation destinations (You · Community ·
// Messages) live in the desktop nav, the mobile bottom nav, and the
// notification bell — the account menu no longer duplicates them. Identity,
// "View public profile", Admin and Sign out are rendered inline in the Header
// because they need user.id / role gating.
export const USER_MENU_ITEMS: NavItem[] = [
  { to: '/settings', icon: Settings, labelKey: 'header.userMenu.settings' },
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

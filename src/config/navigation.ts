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
  BookOpen,
  Martini,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for site navigation.
 *
 * Two layers, and the order between them is the contract:
 *  - INTENT_NAV is the model the user is TAUGHT — the job they came to do. It
 *    leads Header, MobileNavSheet, SearchPopoverEmpty, IntentRail and Footer.
 *  - DESTINATIONS is the additive "browse everything" layer BENEATH it, so
 *    nothing becomes unreachable. It is never the first thing a surface shows.
 *
 * This comment used to claim the header and the search discovery hub shared a
 * source "so the menu and search never drift apart". They did not: after the
 * Intent Router landed, the header rendered INTENT_NAV while SearchPopoverEmpty
 * — the highest-frequency discovery surface on the site — still rendered only
 * DESTINATIONS, i.e. only the content-type model the router replaced. The
 * defect class is "a surface renders the browse layer alone", and it is now
 * asserted at source level in src/config/__tests__/navigation.test.ts.
 */

export type NavCluster = 'places' | 'community' | 'shop' | 'support';

export interface NavDestination {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  cluster: NavCluster;
  /** Maps to a searchTaxonomy id when the destination is 1:1 with an index. */
  searchType?: string;
}

/** Ordered clusters for the discovery hub's "go to" sections. */
export const NAV_CLUSTERS: { id: NavCluster; labelKey: string }[] = [
  { id: 'places', labelKey: 'header.clusters.places' },
  { id: 'community', labelKey: 'header.clusters.community' },
  { id: 'shop', labelKey: 'header.clusters.shop' },
  { id: 'support', labelKey: 'header.clusters.support' },
];

/**
 * Every browse destination. Powers the mobile nav sheet's "Browse everything"
 * grid and the search discovery hub. The intent row above is additive on top of
 * this list, never a replacement for it — nothing here becomes unreachable.
 */
export const DESTINATIONS: NavDestination[] = [
  {
    to: '/venues',
    icon: MapPin,
    labelKey: 'header.nav.venues',
    cluster: 'places',
    searchType: 'venue',
  },
  { to: '/people', icon: UserCheck, labelKey: 'header.nav.people', cluster: 'community' },
  {
    to: '/events',
    icon: Calendar,
    labelKey: 'header.nav.events',
    cluster: 'community',
    searchType: 'event',
  },
  // /places is retired (redirects to the Travelling intent); /cities is the
  // real browse page for this job.
  { to: '/cities', icon: Globe, labelKey: 'header.nav.cities', cluster: 'places' },
  {
    to: '/marketplace',
    icon: Store,
    labelKey: 'header.nav.marketplace',
    cluster: 'shop',
    searchType: 'marketplace',
  },
  {
    to: '/guides',
    icon: BookOpen,
    labelKey: 'header.nav.guides',
    cluster: 'shop',
    searchType: 'guide',
  },
  {
    to: '/news',
    icon: Newspaper,
    labelKey: 'header.nav.news',
    cluster: 'shop',
    searchType: 'news',
  },
  { to: '/map', icon: Map, labelKey: 'header.nav.map', cluster: 'places' },
  { to: '/community/feed', icon: Rss, labelKey: 'header.nav.feed', cluster: 'community' },
  {
    to: '/community/groups',
    icon: UsersRound,
    labelKey: 'header.nav.groups',
    cluster: 'community',
  },
  {
    to: '/community/members',
    icon: UserCheck,
    labelKey: 'header.nav.members',
    cluster: 'community',
  },
  { to: '/tags', icon: Tags, labelKey: 'header.nav.tags', cluster: 'shop' },
  { to: '/travel', icon: Plane, labelKey: 'header.nav.travel', cluster: 'places' },
  {
    to: '/personalities',
    icon: Users,
    labelKey: 'header.nav.personalities',
    cluster: 'community',
    searchType: 'personality',
  },
  {
    to: '/history',
    icon: History,
    labelKey: 'header.nav.history',
    cluster: 'community',
    searchType: 'milestone',
  },
  { to: '/hotels', icon: Building, labelKey: 'header.nav.hotels', cluster: 'places' },
  { to: '/help', icon: LifeBuoy, labelKey: 'header.nav.help', cluster: 'support' },
];

/**
 * Intent Router — the desktop primary nav.
 *
 * Top-level navigation names the JOB a person is doing, not the table the rows
 * live in. Each entry resolves to a composite page that fuses several sources
 * into one answer; the content-type browse routes (/venues, /events, /news, …)
 * all still exist, stay indexed, and remain reachable from inside the intent
 * pages, the mobile sheet, the search popover and the footer.
 *
 * This export replaced PRIMARY_NAV/MORE_NAV, which were dead: Header.tsx
 * hardcoded its own divergent list, so `/venues` and `/people` were flagged
 * `primary: true` here while being unreachable from desktop chrome. Deleting
 * the old concept outright — rather than re-syncing it — is what makes that
 * class of drift structurally impossible: there is nothing left to drift from.
 *
 * Constraints on `to`, both load-bearing:
 *  - Never a 2-letter first segment. `stripLocale` (src/lib/locale.ts) strips
 *    ANY two-letter leading segment, so `/go` would silently break header
 *    active state, MobileBottomNav, RouteFade and getSubmitCta at once.
 *  - Never collide with an existing top-level route. That is why travel is
 *    rebuilt in place at `/travel` and shopping is `/shop` declared ahead of
 *    the legacy `shop/*` redirect, rather than new competing paths.
 * Both are asserted in src/config/__tests__/navigation.test.ts.
 */
export type IntentId = 'going-out' | 'travelling' | 'meet' | 'rights' | 'support' | 'shop';

export interface IntentDestination {
  id: IntentId;
  to: string;
  icon: LucideIcon;
  /** Desktop row label. Keep ≤11 chars — six locales share one flex row. */
  labelKey: string;
  fallback: string;
  /** Fuller job phrasing for the mobile sheet and search popover. */
  subtitleKey: string;
  subtitleFallback: string;
  /** Locale-stripped prefixes that light this entry. */
  activePrefixes: string[];
}

export const INTENT_NAV: IntentDestination[] = [
  {
    id: 'going-out',
    to: '/going-out',
    icon: Martini,
    labelKey: 'header.intents.goingOut.label',
    fallback: 'Going out',
    subtitleKey: 'header.intents.goingOut.subtitle',
    subtitleFallback: 'Bars, clubs and what is on tonight',
    activePrefixes: ['/going-out', '/venues', '/map'],
  },
  {
    id: 'travelling',
    to: '/travel',
    icon: Plane,
    labelKey: 'header.intents.travelling.label',
    fallback: 'Travelling',
    subtitleKey: 'header.intents.travelling.subtitle',
    subtitleFallback: 'Is it safe, where to stay, what to do',
    activePrefixes: [
      '/travel',
      '/places',
      '/city',
      '/country',
      '/cities',
      '/hotels',
      '/villages',
      '/trips',
    ],
  },
  {
    // The one job the Intent Router shipped without. /people, /community and
    // /groups are roughly half the product and had NO desktop nav entry at
    // all — reachable only from the mobile sheet's browse grid. Rebuilt in
    // place at /people (as /travel was) rather than minting a competing path.
    // Deliberately NOT a merge of /people and /community: both are already
    // thin tab shells over two genuinely different jobs — find a person vs
    // join a group — and folding them yields a seven-tab row. /people is the
    // intent's home and links across to the community surfaces.
    id: 'meet',
    to: '/people',
    icon: UsersRound,
    labelKey: 'header.intents.meet.label',
    fallback: 'Meet people',
    subtitleKey: 'header.intents.meet.subtitle',
    subtitleFallback: 'Friends, dates, travel buddies and groups',
    activePrefixes: ['/people', '/community', '/groups', '/friends', '/dating'],
  },
  {
    id: 'rights',
    to: '/rights',
    icon: Scale,
    labelKey: 'header.intents.rights.label',
    fallback: 'Rights',
    subtitleKey: 'header.intents.rights.subtitle',
    subtitleFallback: 'LGBTQ+ law and safety, country by country',
    activePrefixes: ['/rights'],
  },
  {
    id: 'support',
    to: '/support',
    icon: LifeBuoy,
    labelKey: 'header.intents.support.label',
    fallback: 'Support',
    subtitleKey: 'header.intents.support.subtitle',
    subtitleFallback: 'Helplines and organizations near you',
    activePrefixes: ['/support', '/organizations'],
  },
  {
    id: 'shop',
    to: '/shop',
    icon: Store,
    labelKey: 'header.intents.shop.label',
    fallback: 'Shop',
    subtitleKey: 'header.intents.shop.subtitle',
    subtitleFallback: 'Books, apparel, art and gifts',
    activePrefixes: ['/shop', '/marketplace', '/wishlists'],
  },
];

/** Path-prefix match against a locale-stripped pathname. */
export function isIntentActive(intent: IntentDestination, path: string): boolean {
  return intent.activePrefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

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
      // Intent routes — Explore is the mobile "you're in the catalogue" tab,
      // and every intent page is a browse surface.
      '/going-out',
      '/rights',
      '/support',
      '/shop',
      '/organizations',
      '/cities',
      '/venues',
      '/events',
      '/places',
      '/marketplace',
      '/guides',
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

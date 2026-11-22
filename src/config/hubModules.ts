import {
  LayoutDashboard,
  Rss,
  Users,
  CalendarClock,
  Bookmark,
  Award,
  type LucideIcon,
} from '@/components/icons';
import { stripLocale } from '@/lib/locale';
import { trimTrailingSlashes } from '@/lib/trimTrailingSlashes';

/**
 * Registry for the unified /hub community, connection, and personal modules.
 * Single source of truth for the shared navigation — shipping a new
 * module = adding one entry here plus its route in routes.tsx and its case in
 * HubPage. Paths must be static (no params) so the optional /:locale? parent
 * can't mis-capture a segment (see the /me and /community comments in
 * routes.tsx).
 *
 * Hub = things that belong to you. Public discovery (People, Members, Groups,
 * Dating, Travel buddies, Nearby) moved to /meet on 2026-11-22 and lives in
 * src/config/meetModules.ts; nothing appears in both.
 */

export type HubModuleId = 'overview' | 'feed' | 'friends' | 'plans' | 'saved' | 'progress';

export type HubSectionId = 'home' | 'community' | 'personal';

export interface HubModule {
  id: HubModuleId;
  /** Locale-less absolute path (LocalizedLink adds the prefix). */
  path: string;
  icon: LucideIcon;
  labelKey: string;
  defaultLabel: string;
  section: HubSectionId;
}

export const HUB_MODULES: HubModule[] = [
  {
    id: 'overview',
    path: '/hub',
    icon: LayoutDashboard,
    labelKey: 'hub.modules.overview',
    defaultLabel: 'Overview',
    section: 'home',
  },
  {
    id: 'feed',
    path: '/hub/feed',
    icon: Rss,
    labelKey: 'header.nav.feed',
    defaultLabel: 'Feed',
    section: 'community',
  },
  {
    id: 'friends',
    path: '/hub/friends',
    icon: Users,
    labelKey: 'header.userMenu.friends',
    defaultLabel: 'Friends',
    section: 'community',
  },
  {
    id: 'plans',
    path: '/hub/plans',
    icon: CalendarClock,
    labelKey: 'hub.modules.plans',
    defaultLabel: 'Plans',
    section: 'personal',
  },
  {
    id: 'saved',
    path: '/hub/saved',
    icon: Bookmark,
    labelKey: 'hub.modules.saved',
    defaultLabel: 'Saved',
    section: 'personal',
  },
  {
    id: 'progress',
    path: '/hub/progress',
    icon: Award,
    labelKey: 'hub.modules.progress',
    defaultLabel: 'Progress',
    section: 'personal',
  },
];

export function getActiveHubModule(pathname: string) {
  const path = trimTrailingSlashes(stripLocale(pathname));
  return HUB_MODULES.find((module) =>
    module.id === 'overview'
      ? path === module.path
      : path === module.path || path.startsWith(`${module.path}/`),
  );
}

export const HUB_SECTIONS: Array<{
  id: HubSectionId;
  labelKey?: string;
  defaultLabel?: string;
}> = [
  { id: 'home', labelKey: 'header.mobileNav.home', defaultLabel: 'Home' },
  { id: 'community', labelKey: 'header.clusters.community', defaultLabel: 'Community' },
  { id: 'personal', defaultLabel: 'Personal' },
];

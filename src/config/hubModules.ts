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
 * Registry for /hub: the signed-in member's own things, as one flat tab row.
 * Single source of truth for the Hub navigation — shipping a new module =
 * adding one entry here plus its route in routes.tsx and its case in HubPage.
 * Paths must be static (no params) so the optional /:locale? parent can't
 * mis-capture a segment (see the /me and /community comments in routes.tsx).
 *
 * Hub = things that belong to you. Public discovery (People, Members, Groups,
 * Dating, Travel buddies, Nearby) belongs to Meet; nothing appears in both
 * (docs/plans/2026-11-22-hub-meet-ia-design.md). Order is the tab order.
 */

export type HubModuleId = 'overview' | 'plans' | 'saved' | 'friends' | 'feed' | 'progress';

export interface HubModule {
  id: HubModuleId;
  /** Locale-less absolute path (LocalizedLink adds the prefix). */
  path: string;
  icon: LucideIcon;
  labelKey: string;
  defaultLabel: string;
}

export const HUB_MODULES: HubModule[] = [
  {
    id: 'overview',
    path: '/hub',
    icon: LayoutDashboard,
    // Reuses the translated calendar "Today" rather than minting a key.
    labelKey: 'hub.calendar.today',
    defaultLabel: 'Today',
  },
  {
    id: 'plans',
    path: '/hub/plans',
    icon: CalendarClock,
    labelKey: 'hub.modules.plans',
    defaultLabel: 'Plans',
  },
  {
    id: 'saved',
    path: '/hub/saved',
    icon: Bookmark,
    labelKey: 'hub.modules.saved',
    defaultLabel: 'Saved',
  },
  {
    id: 'friends',
    path: '/hub/friends',
    icon: Users,
    labelKey: 'header.userMenu.friends',
    defaultLabel: 'Friends',
  },
  {
    id: 'feed',
    path: '/hub/feed',
    icon: Rss,
    labelKey: 'header.nav.feed',
    defaultLabel: 'Feed',
  },
  {
    id: 'progress',
    path: '/hub/progress',
    icon: Award,
    labelKey: 'hub.modules.progress',
    defaultLabel: 'Progress',
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

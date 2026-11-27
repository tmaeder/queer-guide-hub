import {
  Compass,
  Heart,
  MapPinned,
  Plane,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from '@/components/icons';
import { stripLocale } from '@/lib/locale';
import { trimTrailingSlashes } from '@/lib/trimTrailingSlashes';

/**
 * Meet = shared activities and people discovery. Hub = things that belong to
 * you (src/config/hubModules.ts). Nothing appears in both registries
 * (docs/plans/2026-11-22-hub-meet-ia-design.md).
 *
 * Paths are static so the optional /:locale? parent cannot mis-capture a
 * segment. The travel and nearby IDs remain compatible routes, not primary tabs.
 */
export type MeetModuleId = 'people' | 'members' | 'groups' | 'travel' | 'nearby' | 'dating';

export interface MeetModule {
  id: MeetModuleId;
  path: string;
  icon: LucideIcon;
  labelKey: string;
  defaultLabel: string;
  /** Hidden from signed-out visitors (Dating is sign-in gated). */
  signedInOnly?: boolean;
}

export const MEET_MODULES: MeetModule[] = [
  {
    id: 'people',
    path: '/meet',
    icon: Compass,
    labelKey: 'header.nav.meetups',
    defaultLabel: 'Meetups',
  },
  {
    id: 'members',
    path: '/meet/members',
    icon: UserCheck,
    labelKey: 'header.nav.people',
    defaultLabel: 'People',
  },
  {
    id: 'groups',
    path: '/meet/groups',
    icon: UsersRound,
    labelKey: 'header.nav.groups',
    defaultLabel: 'Groups',
  },
  {
    id: 'travel',
    path: '/meet/travel',
    icon: Plane,
    labelKey: 'people.tabs.travel',
    defaultLabel: 'Travel buddies',
  },
  {
    id: 'nearby',
    path: '/meet/nearby',
    icon: MapPinned,
    labelKey: 'people.tabs.nearby',
    defaultLabel: 'Nearby',
  },
  {
    id: 'dating',
    path: '/meet/dating',
    icon: Heart,
    labelKey: 'people.tabs.dating',
    defaultLabel: 'Dating',
    signedInOnly: true,
  },
];

export function getActiveMeetModule(pathname: string) {
  const path = trimTrailingSlashes(stripLocale(pathname));
  return MEET_MODULES.find((m) =>
    m.id === 'people' ? path === m.path : path === m.path || path.startsWith(`${m.path}/`),
  );
}

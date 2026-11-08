import { findActiveIntent, INTENT_TRACK } from '@/config/navigation';
import { stripLocale } from '@/lib/locale';

export type JourneyTrack = 'pink' | 'blue' | 'green' | 'yellow';

const MOTION_FREE_PREFIXES = [
  '/admin',
  '/help',
  '/support',
  '/tags/rights-by-country/trans',
  '/report',
  '/safety',
];

export function isRouteMotionAllowed(pathname: string): boolean {
  const path = stripLocale(pathname);
  return !MOTION_FREE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function routeJourneyTrack(pathname: string): JourneyTrack {
  const path = stripLocale(pathname);
  const intentId = findActiveIntent(path)?.id;
  // Match the navigation on Knowledge and News, including their child routes.
  if (intentId === 'glossary' || intentId === 'news') return INTENT_TRACK[intentId];

  const segment = path.split('/').filter(Boolean)[0] ?? '';
  if (['people', 'community', 'groups', 'hub', 'messages', 'intimate'].includes(segment)) {
    return 'green';
  }
  if (
    ['cities', 'countries', 'places', 'place', 'villages', 'map', 'travel', 'hotels'].includes(
      segment,
    )
  ) {
    return 'blue';
  }
  if (['guides', 'history', 'marketplace', 'podcasts', 'sitemap'].includes(segment)) {
    return 'yellow';
  }
  return 'pink';
}

export function routeStationName(pathname: string): string {
  const path = stripLocale(pathname);
  const segment = path.split('/').filter(Boolean)[0];
  if (!segment) return 'queer.guide';
  return segment.replaceAll('-', ' ');
}

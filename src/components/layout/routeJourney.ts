import { stripLocale } from '@/lib/locale';

export const ROUTE_JOURNEY_MS = 620;

export type JourneyTrack = 'pink' | 'blue' | 'green' | 'yellow';

const MOTION_FREE_PREFIXES = ['/admin', '/help', '/support', '/rights/trans', '/report', '/safety'];

export function isRouteMotionAllowed(pathname: string): boolean {
  const path = stripLocale(pathname);
  return !MOTION_FREE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function routeJourneyTrack(pathname: string): JourneyTrack {
  const segment = stripLocale(pathname).split('/').filter(Boolean)[0] ?? '';
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
  if (
    ['guides', 'tags', 'news', 'history', 'marketplace', 'podcasts', 'sitemap'].includes(segment)
  ) {
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

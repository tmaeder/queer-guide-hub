// Shared route manifest for the whole-app accessibility + mobile-first sweep.
// Consumed by scripts/a11y-axe-scan.mjs and e2e/a11y-reflow.spec.ts so the axe
// sweep, the 320px reflow gate and CI all cover the same surfaces.
//
// `auth` marks routes that only render real content for a signed-in user:
//   'user'  — any authenticated account (hub, community, people, settings)
//   'admin' — the admin console (rendered via Playwright storageState)
// Anonymous scans still hit auth routes to prove the sign-in gate itself is
// accessible; the scanner swaps in storageState when it is available.
//
// Dynamic-route samples use real production slugs (refresh with
// scripts/a11y-slugs.sql if entities are deleted).

/** Public, no-auth routes — the marketing + discovery + detail surfaces. */
export const PUBLIC_ROUTES = [
  { path: '/', name: 'home' },
  { path: '/venues', name: 'venues-list' },
  { path: '/venues/le-mistral', name: 'venue-detail' },
  { path: '/venues/guides', name: 'venue-guides' },
  { path: '/events', name: 'events-list' },
  { path: '/events/kaohsiung-pride-2027', name: 'event-detail' },
  { path: '/events/guides', name: 'event-guides' },
  { path: '/pride', name: 'pride' },
  { path: '/hotels', name: 'hotels-list' },
  { path: '/hotels/large-private-room-with-balcony-in-central-paris-683525', name: 'hotel-detail' },
  { path: '/marketplace', name: 'marketplace' },
  { path: '/marketplace/hankey-s-toys-big-pop-4-sizes-2ab51478', name: 'marketplace-item' },
  { path: '/marketplace/categories', name: 'marketplace-categories' },
  { path: '/marketplace/guides', name: 'marketplace-guides' },
  { path: '/marketplace/brands/12807-203758186', name: 'marketplace-brand' },
  { path: '/organizations', name: 'organizations' },
  { path: '/organizations/lgl-office', name: 'organization-detail' },
  { path: '/villages/adams-point', name: 'village-detail' },
  { path: '/news', name: 'news' },
  { path: '/news/all', name: 'news-archive' },
  { path: '/places', name: 'places' },
  { path: '/map', name: 'map' },
  { path: '/cities', name: 'cities' },
  { path: '/city/s-o-paulo', name: 'city-detail' },
  { path: '/country/united-kingdom', name: 'country-detail' },
  { path: '/personalities', name: 'personalities' },
  { path: '/personalities/derek-jacobi', name: 'personality-detail' },
  { path: '/tags', name: 'tags' },
  { path: '/tags/community-resource', name: 'tag-detail' },
  { path: '/travel', name: 'travel' },
  { path: '/trips/discover', name: 'trips-discover' },
  { path: '/search', name: 'search' },
  { path: '/submit', name: 'submit-hub' },
  { path: '/donate', name: 'donate' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/help', name: 'help' },
  { path: '/feedback', name: 'feedback' },
  { path: '/accessibility', name: 'accessibility' },
  { path: '/sitemap', name: 'sitemap' },
];

/** Authenticated user surfaces (hub / community / people / settings). */
export const AUTH_ROUTES = [
  { path: '/hub', name: 'hub-overview', auth: 'user' },
  { path: '/hub/messages', name: 'hub-messages', auth: 'user' },
  { path: '/hub/plans', name: 'hub-plans', auth: 'user' },
  { path: '/hub/saved', name: 'hub-saved', auth: 'user' },
  { path: '/community', name: 'community', auth: 'user' },
  { path: '/community/feed', name: 'community-feed', auth: 'user' },
  { path: '/community/members', name: 'community-members', auth: 'user' },
  { path: '/community/groups', name: 'community-groups', auth: 'user' },
  { path: '/people', name: 'people', auth: 'user' },
  { path: '/people/dating', name: 'people-dating', auth: 'user' },
  { path: '/people/nearby', name: 'people-nearby', auth: 'user' },
  { path: '/tools/checklist', name: 'kink-checklist', auth: 'user' },
  { path: '/settings', name: 'settings', auth: 'user' },
];

/** Admin console surfaces (rendered with the admin storageState). */
export const ADMIN_ROUTES = [
  { path: '/admin', name: 'admin-dashboard', auth: 'admin' },
  { path: '/admin/analytics', name: 'admin-analytics', auth: 'admin' },
  { path: '/admin/content', name: 'admin-content', auth: 'admin' },
  { path: '/admin/media', name: 'admin-media', auth: 'admin' },
  { path: '/admin/pipelines', name: 'admin-pipelines', auth: 'admin' },
  { path: '/admin/review', name: 'admin-review', auth: 'admin' },
  { path: '/admin/inbox', name: 'admin-inbox', auth: 'admin' },
  { path: '/admin/automation', name: 'admin-automation', auth: 'admin' },
  { path: '/admin/feedback', name: 'admin-feedback', auth: 'admin' },
  { path: '/admin/users', name: 'admin-users', auth: 'admin' },
  { path: '/admin/hotels', name: 'admin-hotels', auth: 'admin' },
  { path: '/admin/villages', name: 'admin-villages', auth: 'admin' },
  { path: '/admin/duplicates', name: 'admin-duplicates', auth: 'admin' },
  { path: '/admin/maps', name: 'admin-maps', auth: 'admin' },
  { path: '/admin/quests', name: 'admin-quests', auth: 'admin' },
  { path: '/admin/affiliate', name: 'admin-affiliate', auth: 'admin' },
  { path: '/admin/search-intelligence', name: 'admin-search-intel', auth: 'admin' },
  { path: '/admin/places-editorial', name: 'admin-places-editorial', auth: 'admin' },
  { path: '/admin/content/venue-quality', name: 'admin-venue-quality', auth: 'admin' },
  { path: '/admin/content/city-quality', name: 'admin-city-quality', auth: 'admin' },
  { path: '/admin/content/event-quality', name: 'admin-event-quality', auth: 'admin' },
  { path: '/admin/content/marketplace-quality', name: 'admin-marketplace-quality', auth: 'admin' },
  { path: '/admin/settings', name: 'admin-settings', auth: 'admin' },
  { path: '/admin/redirects', name: 'admin-redirects', auth: 'admin' },
  { path: '/admin/recognition', name: 'admin-recognition', auth: 'admin' },
];

export const ALL_ROUTES = [...PUBLIC_ROUTES, ...AUTH_ROUTES, ...ADMIN_ROUTES];

/** Resolve the route list for a scope: 'public' | 'auth' | 'admin' | 'all'. */
export function routesForScope(scope = 'public') {
  switch (scope) {
    case 'all':
      return ALL_ROUTES;
    case 'auth':
      return [...PUBLIC_ROUTES, ...AUTH_ROUTES];
    case 'admin':
      return [...PUBLIC_ROUTES, ...AUTH_ROUTES, ...ADMIN_ROUTES];
    case 'public':
    default:
      return PUBLIC_ROUTES;
  }
}

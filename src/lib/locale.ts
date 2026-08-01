/**
 * Locale-path helpers. The router mounts routes under an optional `/:locale`
 * prefix (e.g. `/de/events`), so any code that matches on the pathname must
 * first strip that prefix. Kept in one place so the regex doesn't drift between
 * the bottom nav, the submit-CTA resolver and the layout shell.
 */

/** Strip the optional leading `/:locale` so path matching is locale-agnostic. */
export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
}

/** Whether the path is the full-bleed map route (`/map` or `/:locale/map`). */
export function isMapRoute(pathname: string): boolean {
  return /^\/(?:[a-z]{2}\/)?map\/?$/.test(pathname);
}

/**
 * Whether the path is inside the admin console. Admin is mounted at the top
 * level (routes.tsx), outside the optional `/:locale` parent, so there is no
 * locale variant to strip. The exact-or-slash test keeps a future
 * `/administrators` route from matching.
 */
export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

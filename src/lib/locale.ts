/**
 * Locale-path helpers. The router mounts routes under an optional `/:locale`
 * prefix (e.g. `/de/events`), so any code that matches on the pathname must
 * first strip that prefix. Kept in one place so the regex doesn't drift between
 * the bottom nav, the submit-CTA resolver and the layout shell.
 */

/**
 * Locales written right-to-left — the single source of truth for text
 * direction. `src/i18n/index.ts` writes `<html dir>` from this set, so any
 * component that mirrors its own layout must ask the same question or it
 * will mirror against the page instead of with it.
 *
 * Deliberately NOT `i18n.dir()`. Two reasons, both load-bearing:
 *  1. `dir()` resolves against `resolvedLanguage`, which falls back to
 *     English the moment a locale bundle fails to load — while `<html dir>`
 *     is written from `language`, the REQUESTED locale. On a flaky CDN the
 *     two disagree, and CSS logical properties follow the attribute.
 *  2. It is a method on the i18next instance, so it does not exist at all
 *     when react-i18next has no instance — i.e. in any test that never
 *     imports `@/i18n`. That is a TypeError, not a wrong direction.
 */
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

/** Whether a locale tag (`ar`, `ar-EG`, …) is written right-to-left. */
export function isRtlLocale(lang: string | undefined | null): boolean {
  return RTL_LOCALES.has((lang ?? '').split('-')[0]);
}

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

/**
 * Whether the path takes the COMPACT footer ("Header and Footer.dc.html",
 * panel 09: "Used on print-adjacent pages, single-purpose flows, and anything
 * inside an account").
 *
 * The full footer is a closing statement — a station map with six track
 * columns, the anti-discrimination policy and the crisis card. A page that is
 * a sign-in form, an onboarding step or an account screen has not been making
 * a statement, and ending it with 600px of sitemap is the footer talking over
 * the task. What survives the collapse is report and hotlines, which is the
 * one thing panel 09 is explicit about.
 *
 * Prefix-matched on a locale-stripped path, with an exact-or-slash test so a
 * future `/settings-export` or `/hubbub` cannot match by accident.
 */
const COMPACT_FOOTER_ROOTS = [
  // Single-purpose flows.
  '/auth',
  '/claim-username',
  '/onboarding',
  // Inside an account.
  '/hub',
  '/settings',
];

export function isCompactFooterRoute(pathname: string): boolean {
  const path = stripLocale(pathname).replace(/\/+$/, '') || '/';
  return COMPACT_FOOTER_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

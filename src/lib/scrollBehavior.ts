/**
 * Where a navigation should leave the reader.
 *
 * The app mounts `<BrowserRouter>` (not a data router), and react-router does
 * no scroll management of its own in that mode — `<ScrollRestoration>` only
 * exists for data routers. Nothing else in the app ever reset the scroll
 * offset on navigation either, so `history.pushState` simply kept whatever
 * offset the reader had: click a venue from halfway down /venues and the
 * detail page opened halfway down, and because most destinations are SHORTER
 * than the listing they were reached from, the browser clamped that offset to
 * the maximum and the page opened at its very bottom.
 *
 * Measured on the running app before this module existed (1440x900):
 *   /about scrolled to y=4163 -> click /venues -> y=2567 of maxY 2567
 *   /venues scrolled to bottom -> click /cities -> y=2042 of maxY 2042
 * i.e. the last line of the footer, every time.
 *
 * "Scroll to top on every location change" is the usual patch and is wrong
 * here: ~90 of this app's ~103 `setSearchParams` call sites push a new history
 * entry for a same-page state change (a tab, a filter, a facet, a sort), so a
 * location-keyed reset would fling the reader to the top of the page every
 * time they ticked a checkbox. The decision therefore keys on the PAGE, not
 * the location, and answers four different questions with four different
 * landing points — see `resolveScrollAction`.
 *
 * Pure and side-effect free so the table can be unit-tested exhaustively;
 * `ScrollManager` performs whatever it returns.
 */

import { isSupportedLocale } from '@/i18n/languages';

export type NavigationKind = 'POP' | 'PUSH' | 'REPLACE';

export type ScrollAction =
  /** Leave the reader exactly where they are. */
  | { kind: 'keep' }
  /** Top of the document — a genuinely new page. */
  | { kind: 'top' }
  /** The element the fragment names, once it exists. */
  | { kind: 'hash'; id: string }
  /** The offset this history entry was left at. */
  | { kind: 'restore'; top: number };

export interface NavSnapshot {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * The path with a leading locale segment removed, so `/de/venues` and
 * `/venues` compare equal.
 *
 * Deliberately NOT `stripLocale()` from `@/lib/locale`, which matches any
 * two-letter first segment (`/^\/(?:[a-z]{2}\/)?/`) and so reads `/me` — the
 * signed-in user's own profile — as the locale `me` on an empty path. That
 * would make a hop between `/me` and `/` look like a language switch and
 * leave the reader at their previous offset. This checks the segment against
 * the actual locale list.
 */
export function withoutLocale(pathname: string): string {
  const segments = pathname.split('/');
  // ['', 'de', 'venues'] -> the candidate locale is segments[1].
  if (segments.length > 1 && isSupportedLocale(segments[1])) {
    return `/${segments.slice(2).join('/')}`;
  }
  return pathname;
}

/** The element id a fragment names, or '' — `#` and `#top` name no element. */
export function hashTargetId(hash: string): string {
  if (!hash || hash === '#') return '';
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    // A malformed percent-escape in the address bar must not throw here.
    return hash.slice(1);
  }
}

/**
 * The landing point for one navigation.
 *
 * @param prev     the location we are leaving, or null on the first render
 * @param next     the location we are arriving at
 * @param kind     react-router's navigation type
 * @param savedTop the offset this history entry was last left at, if known
 */
export function resolveScrollAction(
  prev: NavSnapshot | null,
  next: NavSnapshot,
  kind: NavigationKind,
  savedTop: number | undefined,
): ScrollAction {
  const id = hashTargetId(next.hash);

  // 1. First render — a real page load, a reload, or a link followed from
  //    outside the app. This case MUST be answered before the POP branch
  //    below, because react-router reports the initial render as POP: tested
  //    the other way round, a plain page load was handled as a back
  //    navigation and scrolled to the top, fighting both the browser's own
  //    fragment jump and any page that positions itself on mount.
  //
  //    A fragment is an explicit request and is honoured — the browser's jump
  //    fires before an SPA has rendered the target, so it has to be redone.
  //    Failing that, a stored offset means this document was reloaded and the
  //    reader expects their place back.
  if (!prev) {
    if (id) return { kind: 'hash', id };
    if (typeof savedTop === 'number' && savedTop > 0) return { kind: 'restore', top: savedTop };
    return { kind: 'keep' };
  }

  // 2. Back / forward. The reader is returning to something they have already
  //    read, so the intelligent point is the one they left — not the top, and
  //    certainly not the bottom. A saved offset outranks the fragment: they
  //    may well have scrolled on from it before leaving.
  if (kind === 'POP') {
    if (typeof savedTop === 'number' && savedTop > 0) return { kind: 'restore', top: savedTop };
    return id ? { kind: 'hash', id } : { kind: 'top' };
  }

  const samePage = withoutLocale(prev.pathname) === withoutLocale(next.pathname);

  // 3. Still on the same page. Tab switches, filters, facets, sorts, "load
  //    more" and language changes all land here, and every one of them must
  //    leave the reader looking at what they were looking at. Only a fragment
  //    they did not already have is a request to move.
  if (samePage) {
    if (id && next.hash !== prev.hash) return { kind: 'hash', id };
    return { kind: 'keep' };
  }

  // 4. A genuinely new page: its own top, or the section the link named.
  return id ? { kind: 'hash', id } : { kind: 'top' };
}

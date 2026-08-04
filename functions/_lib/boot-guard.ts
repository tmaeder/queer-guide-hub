/**
 * Blank-page boot guard, as an injectable script body.
 *
 * index.html carries an identical guard inline. That copy is necessary but
 * NOT sufficient: it only protects documents that already contain it. A
 * document served from an *older* build predates the guard entirely, so the
 * one surface that can still reach it is the middleware, which rewrites every
 * HTML response it serves — stale bodies included.
 *
 * Measured on prod 2026-08-04. `/events` and `/venues` were served from a
 * ~3-day-old copy (`age: 265967`, plus an `x-robots-tag: noindex` and
 * `accept-ranges` that nothing in this repo sets — the signature of a
 * Cloudflare-held archived copy). That body referenced `index-BQ4YSaoC.js`,
 * which no longer exists; Pages answers a dead /assets/ URL with index.html at
 * 200 text/html, the browser refuses it as a module, and #root stays empty.
 * The body contained no guard at all, so nothing recovered it.
 *
 * The escape hatch is verified: a bare `/events` returned the stale document,
 * while `/events?__fresh=1` returned the current build. A distinct query
 * string is a distinct cache key, so the reload below reaches a good document
 * even while the bare URL stays pinned.
 *
 * Kept as a string rather than a module the page imports: an import would
 * itself be a hashed /assets/ URL, i.e. exactly the thing that is missing in
 * the failure this guards against.
 *
 * Must not contain the literal `</script>`.
 */
export const BOOT_GUARD_JS = `(function () {
  if (window.__qgBootGuard) return;
  window.__qgBootGuard = 1;
  var KEY = 'preload-error-reload';
  function alreadyRetried() {
    try {
      return !!sessionStorage.getItem(KEY);
    } catch (e) { /* storage blocked - fall through */ }
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      return !!(nav && nav.type === 'reload');
    } catch (e2) {
      return true;
    }
  }
  function reloadFresh() {
    try {
      var u = new URL(location.href);
      u.searchParams.set('__fresh', String(Date.now()));
      location.replace(u.toString());
    } catch (e3) {
      location.reload();
    }
  }
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el === window || el.tagName !== 'SCRIPT') return;
    if (String(el.src || '').lastIndexOf(location.origin + '/assets/', 0) !== 0) return;
    if (alreadyRetried()) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (err) { /* private mode */ }
    reloadFresh();
  }, true);
})();`;

/**
 * The guard as a ready-to-inject `<script>` tag carrying the request nonce.
 *
 * `data-cfasync="false"` is LOAD-BEARING, not a hint. Cloudflare Rocket Loader
 * is enabled on this zone; it rewrites inline scripts and re-executes them
 * itself, and the re-executed copy does NOT carry the nonce. Measured on prod
 * 2026-08-04: the injected guard reached the DOM but came back with
 * `type="text/javascript"` (we emit no `type`) and never ran —
 * `window.__qgBootGuard` was unset, with
 *
 *   Executing inline script violates ... 'nonce-...'. The action has been
 *   blocked.  @ /cdn-cgi/scripts/.../rocket-loader.min.js
 *
 * so the one script whose whole job is recovering a blank page was the script
 * being silently disabled. `data-cfasync="false"` is Rocket Loader's official
 * opt-out and makes it skip the element, leaving the nonce intact.
 */
export function bootGuardTag(nonce: string): string {
  return `<script nonce="${nonce}" data-cfasync="false">${BOOT_GUARD_JS}</script>`;
}

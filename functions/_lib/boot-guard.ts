/**
 * Blank-page boot guard, as an injectable script body.
 *
 * index.html carries an identical guard inline (byte-identical modulo
 * whitespace — enforced by src/test/__tests__/bootGuardSync.test.ts). That
 * copy is necessary but NOT sufficient: it only protects documents that
 * already contain it. A document served from an *older* build predates the
 * guard entirely, so the one surface that can still reach it is the
 * middleware, which rewrites every HTML response it serves — stale bodies
 * included.
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
 * 2026-08-08 extension: the guard now also heals a POISONED BROWSER CACHE.
 * A chunk fetched during a deploy window can be answered with the SPA-shell
 * fallback (200 text/html) or a 404, and public/_headers stamps /assets/*
 * `immutable, max-age=31536000`, so the browser caches that failure for a
 * year. The `?__fresh=` reload alone cannot fix it — the fresh document
 * re-imports the same hashed URLs through the poisoned cache (measured on a
 * real user's Chrome: 8 chunks pinned at 404, guard fired on every reload,
 * page stayed blank forever). Before reloading, the guard now rewrites every
 * /assets/ cache entry it knows about via fetch(url, {cache:'reload'}), and
 * the retry gate allows two attempts instead of one (attempt 1 can land
 * while the deploy window is still propagating).
 *
 * Kept as a string rather than a module the page imports: an import would
 * itself be a hashed /assets/ URL, i.e. exactly the thing that is missing in
 * the failure this guards against.
 *
 * Must not contain the literal `</script>`.
 */
export const BOOT_GUARD_JS = `(function () {
  /* Versioned sentinel: guards from before 2026-08-09 set 1 and lack
     the cache heal, and on an edge-stale document the OLD inline copy
     runs before the middleware-injected copy. Run past a v1 sentinel
     so a heal-capable guard always arms; never run twice ourselves. */
  if (Number(window.__qgBootGuard) >= 2) return;
  window.__qgBootGuard = 2;
  var KEY = 'preload-error-reload';
  var ASSETS = location.origin + '/assets/';
  var MAX_ATTEMPTS = 2;
  var fired = false;
  function attemptsSoFar() {
    try {
      var n = Number(sessionStorage.getItem(KEY)) || 0;
      /* legacy format stored Date.now() - read it as one attempt used */
      return n > 1000 ? 1 : n;
    } catch (e) {
      return -1; /* storage blocked */
    }
  }
  function alreadyRetried() {
    var n = attemptsSoFar();
    if (n >= 0) return n >= MAX_ATTEMPTS;
    try {
      /* No storage: bound by the URL itself - a document already
         carrying __fresh IS the retry. (location.replace records
         nav.type 'navigate', never 'reload', so the navigation-type
         check alone cannot gate this path.) */
      if (String(location.search).indexOf('__fresh=') !== -1) return true;
      var nav = performance.getEntriesByType('navigation')[0];
      return !!(nav && nav.type === 'reload');
    } catch (e2) {
      return true; /* cannot tell - refuse to reload rather than risk a loop */
    }
  }
  function bumpAttempts() {
    var n = attemptsSoFar();
    if (n < 0) return; /* private mode */
    try { sessionStorage.setItem(KEY, String(n + 1)); } catch (e3) { /* ignore */ }
  }
  function reloadFresh() {
    try {
      var u = new URL(location.href);
      u.searchParams.set('__fresh', String(Date.now()));
      location.replace(u.toString());
    } catch (e4) {
      location.reload(); /* URL unavailable - better than nothing */
    }
  }
  function healAssets(done) {
    var urls = [];
    var seen = {};
    function add(u) {
      u = String(u || '');
      if (u.lastIndexOf(ASSETS, 0) !== 0 || seen[u]) return;
      seen[u] = 1;
      urls.push(u);
    }
    try {
      var els = document.querySelectorAll('script[src], link[rel="modulepreload"], link[rel="stylesheet"]');
      for (var i = 0; i < els.length; i++) add(els[i].src || els[i].href);
      var res = performance.getEntriesByType('resource');
      for (var j = 0; j < res.length; j++) add(res[j].name);
    } catch (e5) { /* heal whatever was collected */ }
    if (!urls.length || typeof fetch !== 'function') { done(); return; }
    var finished = false;
    var pending = urls.length;
    function step() {
      if (finished) return;
      pending -= 1;
      if (pending <= 0) { finished = true; done(); }
    }
    /* Hard cap so a dead network cannot strand the recovery reload. */
    setTimeout(function () { if (!finished) { finished = true; done(); } }, 4000);
    for (var k = 0; k < urls.length; k++) {
      try { fetch(urls[k], { cache: 'reload' }).then(step, step); } catch (e6) { step(); }
    }
  }
  window.addEventListener('error', function (e) {
    var el = e.target;
    /* One recovery per document: a deploy window can poison the entry
       script AND the stylesheet, firing two error events - without
       the latch one broken document burns the whole retry budget
       before its first reload. */
    if (fired || !el || el === window || !el.tagName) return;
    var isScript = el.tagName === 'SCRIPT';
    var isStylesheet = el.tagName === 'LINK' && el.rel === 'stylesheet';
    if (!isScript && !isStylesheet) return;
    /* Only our own hashed build output; ignore third-party failures. */
    if (String(el.src || el.href || '').lastIndexOf(ASSETS, 0) !== 0) return;
    if (alreadyRetried()) return;
    fired = true;
    bumpAttempts();
    healAssets(reloadFresh);
  }, true); /* capture - resource load errors do not bubble */
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

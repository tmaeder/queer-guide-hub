(function () {
  'use strict';

  // Same-origin Cloudflare Pages proxy (functions/api/track.ts) — attaches
  // edge geo + connecting IP for the server-side visitor hash, and keeps the
  // request first-party (adblock-resistant).
  var trackUrl = '/api/track';

  // This file is only ever injected by src/utils/analyticsLoader.ts, and only
  // after explicit analytics consent. It is the ONE page-view pipeline; the
  // React-side tracker that used to run beside it (and ignored consent) was
  // deleted 2026-09-12. See src/components/layout/LayoutShell.tsx.
  //
  // It is served from public/ and excluded from Pages Functions in
  // public/_routes.json, so it is plain ES5 with no build step and no imports.
  // The locale list below therefore restates src/i18n/languages.ts;
  // src/lib/__tests__/umamiScript.test.ts reads that module and fails if a
  // locale is added there and not here.

  var trackingDisabled = function () {
    // DNT wins over consent: a visitor can accept the banner in one tab and
    // still have Do Not Track on. navigator.webdriver is a standards-defined
    // flag that Playwright/Puppeteer/Lighthouse set on themselves — excluding
    // automation is a declaration, not UA sniffing, and it cannot misclassify
    // a real visitor with an unusual user agent.
    var dnt = window.doNotTrack || navigator.doNotTrack || navigator.msDoNotTrack;
    return dnt === '1' || dnt === 'yes' || navigator.webdriver === true;
  };

  var getBrowserInfo = function () {
    var ua = navigator.userAgent;
    var browser = 'Unknown',
      os = 'Unknown',
      device = 'desktop';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS')) os = 'iOS';
    if (/Mobi|Android/i.test(ua)) device = 'mobile';
    else if (/Tablet|iPad/i.test(ua)) device = 'tablet';
    return { browser: browser, os: os, device: device };
  };

  // The 11 locales from src/i18n/languages.ts. Enumerated deliberately rather
  // than reusing stripLocale()'s looser `/^\/(?:[a-z]{2}\/)?/`, which eats any
  // two-letter first segment — it would rewrite /go/:slug to /:slug and
  // /me/trips to /trips, merging real pages into each other. The locale is
  // already captured independently on umami.session.language, so keeping the
  // prefix in the URL only splits one page into eleven rows nothing re-joins.
  var LOCALE_RE = /^\/(?:en|es|fr|de|pt|it|ru|zh|ja|ko|ar)(?=\/|$)/;

  // Query parameters that are UI state, not a different page. ?section= is
  // written by the editorial scroll-spy on every section a reader passes
  // (src/components/entity/editorial/EditorialDetailLayout.tsx) and ?preview=
  // is the CMS preview flag.
  var DROP_PARAMS = ['section', 'preview'];

  var currentUrl = function () {
    var path = location.pathname.replace(LOCALE_RE, '') || '/';
    var params = new URLSearchParams(location.search);
    for (var i = 0; i < DROP_PARAMS.length; i++) params.delete(DROP_PARAMS[i]);
    var q = params.toString();
    return q ? path + '?' + q : path;
  };

  // The URL of the last page view we sent. A navigation that does not change
  // the normalized URL is not a page view, whatever fired it — this is the
  // belt to the braces below, and it makes a repeat beacon unspellable no
  // matter what else ends up patching history in future.
  var lastUrl = null;

  var track = function (name, data) {
    if (trackingDisabled()) return;
    var url = currentUrl();
    if (!name) {
      if (url === lastUrl) return;
      lastUrl = url;
    }
    var info = getBrowserInfo();
    var payload = {
      url: url,
      title: document.title,
      hostname: location.hostname,
      language: navigator.language,
      referrer: document.referrer,
      screen: screen.width + 'x' + screen.height,
      browser: info.browser,
      os: info.os,
      device: info.device,
    };
    if (name) {
      payload.name = name;
      payload.data = data;
    }
    fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(function () {});
  };

  if (!trackingDisabled()) {
    // pushState and popstate only. replaceState is deliberately NOT patched:
    // in this app a replaceState is a component writing UI state back to the
    // URL, not a navigation. The editorial scroll-spy issues one every 300ms
    // while a reader scrolls, and patching it made /travel alone responsible
    // for 268,313 page views across 981 sessions in 30 days — 59% of all
    // traffic came from 1,244 such sessions. A reader scrolling one article is
    // one page view.
    var origPush = history.pushState;
    var onNav = function () {
      setTimeout(function () {
        track();
      }, 300);
    };
    history.pushState = function () {
      origPush.apply(history, arguments);
      onNav();
    };
    window.addEventListener('popstate', onNav);
    onNav();
  }

  window.umami = { track: track };
})();

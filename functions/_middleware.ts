/**
 * Pages middleware: rewrites the SPA shell <head> per route so every URL
 * ships its own <title>, <meta name="description">, <link rel="canonical">,
 * absolute OG/Twitter tags, hreflang alternates, and (where appropriate)
 * JSON-LD.
 *
 * For crawler user agents on indexable routes we also inject route-specific
 * body content into <div id="root">. Real users get the SPA shell unchanged;
 * React's createRoot() replaces children on mount so the SPA mounts cleanly
 * over the injected content with no hydration mismatch.
 *
 * Phase 3: detail routes (/news/:slug, /events/:slug, etc.) look up the
 * row in Supabase and override meta/body/JSON-LD with type-specific values.
 * If the row is missing, the middleware returns a real 404 instead of
 * silently serving the SPA shell (which would let the SPA bounce the user
 * to /news with an HTTP 200 — bad for crawlers, bad for users).
 * absolute OG/Twitter tags, hreflang alternates, and (on the homepage or
 * matching detail rows) JSON-LD.
 *
 * Phase 2: for crawler user agents on indexable routes, also injects
 * route-specific body content into <div id="root">. Real users get the SPA
 * shell unchanged; React's createRoot() replaces children on mount, so
 * even when Googlebot's JS-rendering pass runs the SPA mounts cleanly
 * over the injected content with no hydration mismatch (we use createRoot,
 * not hydrateRoot).
 *
 * Phase 3: detail routes (/venues/:slug, /events/:slug, …) look up the
 * row in Supabase and override meta/body/JSON-LD with type-specific
 * values (LocalBusiness, Event, …). Detail responses are cached at the
 * edge for 5 minutes.
 *
 * Phase 3.7: standalone landing pages (/spaces/:tag, /pride/:year,
 * /pride/:year/:city) bypass the SPA shell entirely and return a
 * complete HTML document. These URLs don't exist as SPA routes, so
 * handing them to the SPA would render 404 — a cloaking risk if we then
 * served different content to bots.
 */
import {
  resolveMeta,
  canonicalUrl,
  isIndexable,
  DEFAULT_OG_IMAGE,
  splitLocale,
  localizedUrl,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from './_lib/routeMeta';
import { homepageJsonLd } from './_lib/jsonLd';
import { getBranding, brandStyleTag, brandingMeta, brandFontPreloads } from './_lib/branding';
import { isBotUserAgent } from './_lib/botUa';
import { buildBodyHtml, buildNoscriptHtml } from './_lib/routeBody';
import { isLocaleLocalised, LOCALISED_LOCALES } from './_lib/localisedLocales';
import { resolveDetailRoute, isDetailPath, resolveSlugRedirect } from './_lib/detail';
import { resolveLandingRoute } from './_lib/landing';
import { bootGuardTag } from './_lib/boot-guard';
import {
  applySecurityHeaders,
  generateCspNonce,
} from './_lib/securityHeaders';
import type { Env } from './_lib/sitemap';

// Prefixes that look like static assets. If the SPA catch-all in
// _redirects falls through and we'd otherwise serve index.html for one
// of these, return a real 404 instead — module loaders reject text/html
// for a .js URL ("Expected a JavaScript module") and caches happily
// store HTML under a hashed-asset URL, which then bricks every
// subsequent navigation. See finding F2.
const ASSET_PREFIXES = ['/assets/', '/icons/', '/images/', '/fonts/'];
const ASSET_SUFFIXES = [
  '.js',
  '.mjs',
  '.css',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
];

// Path prefixes the route-meta middleware never touches (no HTML to rewrite).
//
// NOTE (2026-08-01): the asset branch below is mostly DEAD IN PRODUCTION now,
// and that is deliberate. public/_routes.json excludes /assets/, /fonts/,
// /icons/, /images/, /og/, /locales/ and the loose static files, so Pages
// serves them without invoking this Function at all.
//
// Why: Pages Functions ARE Workers and bill against the same request quota,
// and Pages runs Functions AHEAD of static assets by default — so every one
// of the ~50 hashed chunks in a cold page load was a billed invocation just
// to reach the pass-through on line ~176. That put a single page view at ~51
// requests, which exhausted the account's free 100k/day cap after roughly
// 1,800 page views and took the whole site down every afternoon with
// `429 error code: 1027` (see the Workers-AI billing memo).
//
// What that costs us: the synthetic-404 guard below no longer runs at the
// edge for excluded paths. public/sw.js still enforces the same rule
// client-side (EXT_CONTENT_TYPES / isResponseValidForUrl), which is what
// actually protects returning users with a stale bundle. Keep the branch —
// it still covers any asset-looking path NOT in the exclude list, and it
// comes straight back if the exclusions are ever narrowed.
const SKIP_PREFIXES = ['/api/', '/functions/'];
const SKIP_SUFFIXES = ['.json', '.xml', '.txt'];

function looksLikeAssetPath(pathname: string): boolean {
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return ASSET_SUFFIXES.some((s) => pathname.endsWith(s));
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

class HtmlLangRewriter {
  constructor(private readonly lang: string) {}
  element(el: Element) {
    el.setAttribute('lang', this.lang);
  }
}

class TitleRewriter {
  constructor(private readonly title: string) {}
  element(el: Element) {
    el.setInnerContent(this.title);
  }
}

class NoscriptRewriter {
  constructor(private readonly html: string) {}
  element(el: Element) {
    el.setInnerContent(this.html, { html: true });
  }
}

class MetaContentRewriter {
  constructor(private readonly content: string) {}
  element(el: Element) {
    el.setAttribute('content', this.content);
  }
}

class HeadInjector {
  constructor(private readonly html: string) {}
  element(el: Element) {
    el.append(this.html, { html: true });
  }
}

class RootBodyInjector {
  constructor(private readonly html: string) {}
  element(el: Element) {
    el.setInnerContent(this.html, { html: true });
  }
}

// Stamps a fresh CSP nonce on every <script> element in the rewritten
// HTML so the nonce-based CSP can drop 'unsafe-inline' from script-src
// without breaking the theme bootstrap or the umami loader.
class ScriptNonceInjector {
  constructor(private readonly nonce: string) {}
  element(el: Element) {
    el.setAttribute('nonce', this.nonce);
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const { pathname } = url;

  // Per-request CSP nonce. Generated up front so both the HTML rewriter
  // and any synthetic 404 we may emit share the same value.
  const cspNonce = generateCspNonce();

  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return next();
  if (SKIP_SUFFIXES.some((s) => pathname.endsWith(s))) return next();

  const isAssetLikePath = looksLikeAssetPath(pathname);

  // Static-asset paths: let the CF Pages static handler answer. If the
  // file exists we hand the response through untouched (the static
  // handler sets the right Content-Type and the _headers rules apply).
  // If the SPA catch-all in _redirects has rewritten the response to
  // index.html (text/html), convert it into a real 404 — see F2.
  if (isAssetLikePath) {
    const assetResponse = await next();
    const assetCt = (assetResponse.headers.get('content-type') ?? '').toLowerCase();
    if (assetCt.includes('text/html')) {
      return notFoundAssetResponse(pathname, cspNonce);
    }
    return assetResponse;
  }

  // Strip the optional /:locale prefix so route resolution operates on the
  // canonical (default-locale) path. Each translated URL keeps its own
  // self-canonical and exposes hreflang alternates to its 10 siblings.
  const { locale, basePath } = splitLocale(pathname);

  // Phase 3.7: standalone landing pages (/spaces/:tag, /pride/:year,
  // /pride/:year/:city) bypass the SPA shell and return a complete HTML
  // document.
  const landing = await resolveLandingRoute(env, basePath);
  if (landing) {
    applySecurityHeaders(landing, cspNonce);
    return landing;
  }

  let response = await next();
  let contentType = response.headers.get('content-type') ?? '';

  // SPA fallback. With a Pages Function claiming `/*`, the `_redirects`
  // rule `/*  /index.html  200` is bypassed: the static-asset layer
  // returns the built-in 404 page for any path that isn't an actual
  // file. Refetch the SPA shell so React Router can render the route.
  //
  // Fetch `/` rather than `/index.html` — CF Pages redirects
  // `/index.html` → `/` (308) and `env.ASSETS.fetch` does NOT auto-follow,
  // which made the original fallback silently fail (indexResponse.ok =
  // false on a 308) and 404-ed every deep route. See feedback 81017609.
  //
  // Detail routes that look like SPA routes but have no matching DB row
  // still 404 — that branch runs after this block.
  // A 404 is NOT the only way we end up needing the shell. Measured on prod
  // 2026-08-04: Pages' static layer held an aged object for the exact path
  // `/events` and answered it with **200**, so this branch was skipped
  // entirely and the middleware rewrote that stale body — injecting a fresh
  // canonical, nonce and boot guard into a document referencing
  // `index-BQ4YSaoC.js`, a chunk later deploys had deleted. The page rendered
  // blank while every server-side signal looked healthy.
  //
  // `age` is the discriminator, and it is a reliable one: our own Functions
  // (news/[slug], the landing routes) build their HTML per request and never
  // emit `age`, so its presence means this body came from a cached static
  // object rather than from code. The same object also carried
  // `x-robots-tag: noindex` and `accept-ranges` — which is what made this look
  // like a CDN fault for days, since `age: 270870` alongside
  // `cf-cache-status: DYNAMIC` reads as a contradiction. Serving a stale SPA
  // shell is never correct: it is always safe to replace it with the current
  // one, because the shell is identical for every SPA route.
  const servedStaleShell =
    response.status === 200 && contentType.includes('text/html') && response.headers.has('age');

  if ((response.status === 404 || servedStaleShell) && contentType.includes('text/html')) {
    // Key this subrequest to the running deployment. With a bare `/` the key
    // never changes across deploys, and a stale shell answered it for days:
    // `/events` and `/venues` served a ~3-day-old document (age: 265967)
    // referencing `index-BQ4YSaoC.js`, a chunk later deploys had deleted.
    // Pages then answers that dead /assets/ URL with index.html at 200
    // text/html, the browser refuses it as a module, and #root stays empty —
    // a blank page. The homepage was fine throughout because a direct hit on
    // `/` never goes through this branch, which is why the fault looked
    // per-route and unreproducible.
    const buildKey = env.CF_PAGES_COMMIT_SHA;
    const shellUrl = new URL('/', request.url);
    if (buildKey) shellUrl.searchParams.set('__build', buildKey);
    let indexResponse = await env.ASSETS.fetch(shellUrl.toString());
    // A query string must never cost us the shell: if this Pages runtime
    // treats `/?__build=…` as a miss, fall back to the bare path rather than
    // letting every deep route 404.
    if (!indexResponse.ok && buildKey) {
      indexResponse = await env.ASSETS.fetch(new URL('/', request.url).toString());
    }
    if (indexResponse.ok) {
      // Copy ONLY what this response legitimately owns. The previous code
      // passed `indexResponse.headers` through wholesale, which published the
      // subrequest's own cache metadata — `age`, `accept-ranges` — and, worse,
      // an `x-robots-tag: noindex` that nothing in this repo sets, on real
      // indexable pages. Those leaked headers are also what made the fault
      // read as a CDN cache problem for days: an `age` of 265967 on a
      // `cf-cache-status: DYNAMIC` response is a contradiction, so every
      // purge (including purge_everything, and a dashboard purge) was aimed
      // at a cache that never held it.
      const shellHeaders = new Headers();
      const shellCt = indexResponse.headers.get('content-type');
      if (shellCt) shellHeaders.set('content-type', shellCt);
      shellHeaders.set('cache-control', 'public, max-age=0, must-revalidate');
      response = new Response(indexResponse.body, {
        status: 200,
        headers: shellHeaders,
      });
      contentType = response.headers.get('content-type') ?? '';
    }
  }

  if (!contentType.includes('text/html')) return response;
  // Bail on non-200 responses — error pages, redirects, and 410 Gone
  // (functions/news/[slug].ts) ship complete HTML that the head-rewriter
  // would clobber.
  if (response.status !== 200) return response;

  const pathIndexable = isIndexable(basePath);

  // P3.1 — unlocalised locale-prefixed URLs are noindexed so Google doesn't
  // index 10 English duplicates of every page. Default locale (no prefix)
  // is always indexable. See scripts/seo-localised-locales.mjs.
  const localeIndexable = !locale || locale === DEFAULT_LOCALE || isLocaleLocalised(locale);

  // Detail routes look up the row in Supabase and override meta/body/JSON-LD.
  // Returns null if the path isn't a detail route OR the row isn't found.
  const detail = await resolveDetailRoute(env, basePath);

  // Published branding overrides (site_branding, /admin/design). Memoized
  // 60s per isolate; null (fetch failure or kill-switch) = stock site.
  const branding = await getBranding(env);
  const bMeta = brandingMeta(branding);

  // Per-row indexability (P1.1): seo_indexable=false on the row vetoes
  // indexing even if the path is otherwise indexable.
  const indexable =
    pathIndexable && localeIndexable && (detail ? detail.indexable !== false : true);

  // Hard 404 for unknown detail slugs. We only return 404 when the path
  // *looks like* a detail route — for non-detail paths a null detail just
  // means "no override needed" and the SPA renders normally.
  if (!detail && isDetailPath(basePath)) {
    // Renamed-venue 301 before the hard 404 — keeps link equity for merged slugs.
    const redirectTarget = await resolveSlugRedirect(env, basePath);
    if (redirectTarget) {
      const location = locale ? localizedUrl(locale, redirectTarget) : canonicalUrl(redirectTarget);
      return new Response(null, {
        status: 301,
        headers: {
          Location: location,
          'Cache-Control': 'public, s-maxage=3600, max-age=600',
        },
      });
    }
    const notFound = new Response(notFoundHtml(basePath), {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, max-age=30',
      },
    });
    applySecurityHeaders(notFound, cspNonce);
    return notFound;
  }

  const meta = detail?.meta ?? resolveMeta(basePath, bMeta);
  const canonical = locale ? localizedUrl(locale, basePath) : canonicalUrl(basePath);
  const ogImage = meta.ogImage ?? bMeta.og_image_url ?? DEFAULT_OG_IMAGE;
  // og:type stays 'website' — crawlers rely on JSON-LD @type for fine-grained
  // typing (NewsArticle / Place / Event). og:type=article would be wrong for
  // city/country/venue detail pages.
  const ogType = 'website';

  // Tags appended to <head>. Append (rather than replace) so duplicates from
  // the source HTML are tolerated; crawlers honor the *last* tag.
  // Tags appended to <head>. We append rather than replace for og:* /
  // twitter:* because the source HTML may also have them — duplicates
  // are tolerated by crawlers but we want the *last* tag to win, which
  // append guarantees.
  const headInjections: string[] = [
    // Blank-page boot guard. index.html ships an identical inline copy, which
    // covers documents built after it landed; this injection is what reaches
    // an OLDER document, whose body predates the guard and so can never
    // recover on its own. Both are no-ops when the page boots normally, and
    // the shared window.__qgBootGuard sentinel keeps the two from
    // double-reloading when both are present. See _lib/boot-guard.ts.
    bootGuardTag(cspNonce),
    `<link rel="canonical" href="${escapeAttr(canonical)}">`,
    `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}">`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="${escapeAttr(bMeta.site_name ?? 'Queer Guide')}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="${escapeAttr(bMeta.twitter_handle ?? '@queerguide')}">`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`,
  ];

  // hreflang alternates: one link per supported locale + x-default.
  // hreflang alternates: one link per supported locale, plus x-default.
  // Each locale's URL points to itself; the default locale is no-prefix
  // English.
  if (indexable) {
    // P3.1 — only emit hreflang for locales that have meaningful
    // translations. Untranslated locales produced duplicate English
    // content with no signal value; emitting them as alternates told
    // Google to index 10 identical English pages per URL. The localised
    // set is regenerated by scripts/seo-localised-locales.mjs.
    void SUPPORTED_LOCALES; // keep the import live so future changes stay in sync
    for (const l of LOCALISED_LOCALES) {
      headInjections.push(
        `<link rel="alternate" hreflang="${l}" href="${escapeAttr(localizedUrl(l, basePath))}">`,
      );
    }
    headInjections.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeAttr(localizedUrl(DEFAULT_LOCALE, basePath))}">`,
    );
  } else {
    headInjections.push('<meta name="robots" content="noindex,nofollow">');
  }

  if (basePath === '/' || basePath === '') {
    headInjections.push(homepageJsonLd(bMeta));
  }
  if (detail?.jsonLd) {
    headInjections.push(detail.jsonLd);
  }

  // Branding overrides: theme-color metas (last matching tag wins over the
  // static ones in index.html) and the token override style block. The style
  // is appended at the very end of <head> so it lands after the Vite CSS
  // <link> and wins the custom-property cascade.
  if (bMeta.theme_color_light) {
    headInjections.push(
      `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${escapeAttr(bMeta.theme_color_light)}">`,
    );
  }
  if (bMeta.theme_color_dark) {
    headInjections.push(
      `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${escapeAttr(bMeta.theme_color_dark)}">`,
    );
  }
  const brandStyle = brandStyleTag(branding);
  if (brandStyle) {
    headInjections.push(brandStyle);
  }
  for (const preload of brandFontPreloads(branding)) {
    headInjections.push(preload);
  }

  const rewriter = new HTMLRewriter()
    .on('html', new HtmlLangRewriter(locale))
    .on('title', new TitleRewriter(meta.title))
    .on('meta[name="description"]', new MetaContentRewriter(meta.description))
    .on('script', new ScriptNonceInjector(cspNonce))
    .on('head', new HeadInjector(headInjections.join('\n    ')));

  // P3.3 — per-route noscript fallback. Crisis routes keep the global
  // crisis-hotline default that ships in index.html (buildNoscriptHtml
  // returns null for them). Other indexable routes get a route-specific
  // summary + internal links so pre-JS visitors see meaningful content.
  const noscriptHtml = indexable ? buildNoscriptHtml(basePath) : null;
  if (noscriptHtml) {
    rewriter.on('noscript', new NoscriptRewriter(noscriptHtml));
  }

  const isBot = indexable && isBotUserAgent(request.headers.get('user-agent'));
  if (isBot) {
    const bodyHtml =
      detail?.body ?? buildBodyHtml(basePath, { title: meta.title, description: meta.description });
    rewriter.on('#root', new RootBodyInjector(bodyHtml));
  }

  const rewritten = rewriter.transform(response);
  applySecurityHeaders(rewritten, cspNonce);

  // Vary on UA so downstream caches don't serve bot HTML to humans.
  // We branch on User-Agent for indexable HTML responses, so downstream
  // caches must vary on UA to avoid serving bot HTML to humans (or vice
  // versa).
  if (isBot || indexable) {
    rewritten.headers.append('Vary', 'User-Agent');
  }

  // Detail pages are dynamic but row content changes infrequently — let the
  // edge cache hold for 5 minutes to bound Supabase load.
  // Detail pages are dynamic but the row content changes infrequently —
  // let the edge cache hold for 5 minutes to bound Supabase load.
  if (detail) {
    rewritten.headers.set('Cache-Control', 'public, s-maxage=300, max-age=60');
  }

  return rewritten;
};

type NotFoundKind = {
  title: string;
  heading: string;
  body: string;
  backLabel: string;
  backHref: string;
  /** HSL channel triple of the line this kind rides, for the dead-end artwork.
   *  Must match a `--track-*` in src/index.css; omitted = an ink line. */
  track?: string;
};

/** Mirrors SEGMENT_TYPE in src/pages/NotFound.tsx — the SPA renders this same
 *  404 for client-side navigations, and the two must tell one story. Tracks
 *  mirror ROUTE_BULLET_MAP in src/components/transit/routeBulletMap.ts. */
const NOT_FOUND_KINDS: Record<string, NotFoundKind> = {
  personality: {
    title: 'Person not found',
    heading: 'Nobody at this stop.',
    body: 'The person you\'re looking for was moved, removed, or never existed.',
    backLabel: 'Back to people',
    backHref: '/personalities',
    track: '330 100% 56%',
  },
  news: {
    title: 'Article not found',
    heading: 'No article at this stop.',
    body: 'The article you\'re looking for was moved or removed.',
    backLabel: 'Back to news',
    backHref: '/news',
    track: '193 100% 45%',
  },
  venue: {
    title: 'Venue not found',
    heading: 'No venue at this stop.',
    body: 'The venue you\'re looking for was moved or removed.',
    backLabel: 'Browse venues',
    backHref: '/venues',
    track: '330 100% 56%',
  },
  event: {
    title: 'Event not found',
    heading: 'No event at this stop.',
    body: 'The event you\'re looking for was moved or removed.',
    backLabel: 'Browse events',
    backHref: '/events',
    track: '193 100% 45%',
  },
  hotel: {
    title: 'Hotel not found',
    heading: 'No hotel at this stop.',
    body: 'The hotel you\'re looking for was moved or removed.',
    backLabel: 'Browse hotels',
    backHref: '/hotels',
    track: '50.1 100% 50%',
  },
  city: {
    title: 'City not found',
    heading: 'No city at this stop.',
    body: 'The city you\'re looking for was moved or removed.',
    backLabel: 'Browse cities',
    backHref: '/cities',
    track: '135.6 74.5% 52.4%',
  },
  country: {
    title: 'Country not found',
    heading: 'No country at this stop.',
    body: 'The country you\'re looking for was moved or removed.',
    backLabel: 'Browse destinations',
    backHref: '/travel',
    track: '50.1 100% 50%',
  },
  village: {
    title: 'District not found',
    heading: 'No district at this stop.',
    body: 'The district you\'re looking for was moved or removed.',
    backLabel: 'Browse destinations',
    backHref: '/travel',
    track: '135.6 74.5% 52.4%',
  },
  marketplace: {
    title: 'Product not found',
    heading: 'No product at this stop.',
    body: 'The product you\'re looking for was moved or removed.',
    backLabel: 'Browse the marketplace',
    backHref: '/marketplace',
    track: '50.1 100% 50%',
  },
};

function notFoundKindFor(pathname: string): NotFoundKind {
  // Match /<segment>/<slug>; segment normalized to a singular kind key.
  const m = pathname.match(/^\/([^/]+)\//);
  const segRaw = (m?.[1] ?? '').toLowerCase();
  if (segRaw.startsWith('personalit')) return NOT_FOUND_KINDS.personality;
  if (segRaw === 'news') return NOT_FOUND_KINDS.news;
  if (segRaw.startsWith('venue')) return NOT_FOUND_KINDS.venue;
  if (segRaw.startsWith('event')) return NOT_FOUND_KINDS.event;
  if (segRaw.startsWith('hotel')) return NOT_FOUND_KINDS.hotel;
  if (segRaw === 'city' || segRaw === 'cities') return NOT_FOUND_KINDS.city;
  if (segRaw === 'country' || segRaw === 'countries') return NOT_FOUND_KINDS.country;
  if (segRaw.startsWith('village')) return NOT_FOUND_KINDS.village;
  if (segRaw === 'marketplace') return NOT_FOUND_KINDS.marketplace;
  return {
    title: 'Page not found',
    heading: 'No stop here.',
    body: 'The page you\'re looking for was moved or removed.',
    backLabel: 'Home',
    backHref: '/',
  };
}

// Synthetic 404 for missing static-asset paths. Body is plain text so
// a JS/CSS module loader hitting this URL fails with a clear "404",
// not "Expected JavaScript module but received text/html". Security
// headers are applied so even error responses carry CSP (finding F6).
function notFoundAssetResponse(pathname: string, nonce: string): Response {
  const res = new Response(`404 Not Found: ${pathname}\n`, {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Don't let edges or browsers cache a 404 for a hashed asset:
      // a follow-up deploy may legitimately republish the file.
      'Cache-Control': 'no-store',
    },
  });
  applySecurityHeaders(res, nonce);
  return res;
}

/** The failed slug — the ghost station's name. Decoded so `%20` reads as a
 *  space rather than as machine noise; falls back to the raw path. */
function ghostStationLabel(pathname: string): string {
  const segs = pathname.split('?')[0].split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  if (!last) return pathname;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * The edge 404 — a standalone document, and for any detail route hit directly
 * or by a crawler it is the ONLY 404 a visitor sees. The React page never runs
 * here, so this has to carry the design system on its own: paper and ink, the
 * self-hosted display face, squared corners, and the same dead-end-track story
 * as src/components/transit/DeadEndTrack.tsx.
 *
 * Colours are HSL channel triples copied from `:root` in src/index.css rather
 * than hex, so the two can be compared literally — this file is in ESLint's
 * ignore list, so the design rules do not guard it and
 * src/test/__tests__/edgeNotFoundTokens.test.ts does instead.
 *
 * CSP: the response gets a nonce policy, but `style-src` keeps
 * `'unsafe-inline'` (functions/_lib/securityHeaders.ts), so the inline
 * `<style>` runs, and `font-src 'self'` covers the two woff2 files. There is
 * deliberately no script here at all.
 */
function notFoundHtml(pathname: string): string {
  const safePath = escapeAttr(pathname);
  const kind = notFoundKindFor(pathname);
  const track = kind.track ?? '0 0% 6.7%';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="hsl(60 33% 97%)">
<title>${escapeAttr(kind.title)} · Queer Guide</title>
<link rel="canonical" href="https://queer.guide${safePath}">
<style>
  @font-face { font-family: 'Anton'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/anton/anton-latin-wght-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Anton'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/anton/anton-latin-ext-wght-normal.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  @font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 300 700; font-display: swap; src: url('/fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 300 700; font-display: swap; src: url('/fonts/space-grotesk/space-grotesk-latin-ext-wght-normal.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  :root { --paper: 60 33% 97%; --ink: 0 0% 6.7%; --muted: 0 0% 33%; --track: ${track}; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { font-family: 'Space Grotesk', system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: hsl(var(--paper)); color: hsl(var(--ink)); }
  /* Same frame as every other page: the 1600 (--container-page) cap and the
     4/6/8 gutter that PageContainer applies in the SPA. Prose and artwork are
     capped separately so the measure stays readable at full width. */
  main { flex: 1; width: 100%; max-width: 100rem; margin: 0 auto; padding: 2rem 1rem; }
  @media (min-width: 640px) { main { padding: 3rem 1.5rem; } }
  @media (min-width: 768px) { main { padding: 3rem 2rem; } }
  .card { width: 100%; }
  .kicker { display: inline-block; background: hsl(var(--ink)); color: hsl(var(--paper)); font-family: 'Anton', 'Space Grotesk', sans-serif; font-size: 0.8125rem; padding: 0.25rem 0.5rem; }
  h1 { font-family: 'Anton', 'Space Grotesk', sans-serif; font-weight: 400; font-size: clamp(3.25rem, 9vw, 4.75rem); line-height: 0.95; margin: 1.5rem 0 0; }
  .lede { color: hsl(var(--muted)); font-size: 1.0625rem; line-height: 1.7; margin: 1.5rem 0 0; max-width: 48rem; }
  .panel { border: 3px solid hsl(var(--ink)); padding: 1.5rem; margin-top: 2.5rem; max-width: 56rem; }
  .panel svg { display: block; width: 100%; height: auto; }
  .stop { margin: 1rem 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
  .stop-label { font-size: 0.8125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: hsl(var(--muted)); }
  .stop-name { font-family: 'Anton', 'Space Grotesk', sans-serif; font-size: 2rem; line-height: 1.2; word-break: break-all; }
  .exits { margin-top: 2rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .exits a { display: inline-flex; align-items: center; border: 2px solid hsl(var(--ink)); padding: 0.5rem 1rem; font-size: 0.9375rem; font-weight: 700; text-decoration: none; color: hsl(var(--ink)); }
  .exits a.primary { background: hsl(var(--ink)); color: hsl(var(--paper)); }
  footer { border-top: 3px solid hsl(var(--ink)); padding: 1rem; text-align: center; color: hsl(var(--muted)); font-size: 0.8125rem; }
</style>
</head>
<body>
<main><div class="card">
<div class="kicker">Service notice · 404</div>
<h1>${escapeAttr(kind.heading)}</h1>
<p class="lede">${escapeAttr(kind.body)}</p>
<div class="panel">
<svg viewBox="0 0 300 100" role="presentation" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<path d="M 10 80 H 44 Q 60 80 71 69 L 101 39 Q 112 28 128 28 H 158" stroke="hsl(var(--track))" stroke-width="5"/>
<g stroke="hsl(var(--ink))" fill="hsl(var(--paper))">
<circle cx="34" cy="80" r="7" stroke-width="4"/>
<circle cx="158" cy="28" r="7" stroke-width="4"/>
<path d="M 186 28 H 244" stroke-width="4" stroke-dasharray="2 12" opacity="0.4" fill="none"/>
<g opacity="0.55">
<circle cx="266" cy="28" r="12" stroke-width="4"/>
<path d="M 259 21 L 273 35 M 273 21 L 259 35" stroke-width="4" fill="none"/>
</g>
</g>
</svg>
<p class="stop"><span class="stop-label">No stop</span><span class="stop-name">${escapeAttr(ghostStationLabel(pathname))}</span></p>
</div>
<div class="exits">
<a class="primary" href="${escapeAttr(kind.backHref)}">${escapeAttr(kind.backLabel)}</a>
<a href="/">Home</a>
</div>
</div></main>
<footer>Queer Guide</footer>
</body>
</html>`;
}

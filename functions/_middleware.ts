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
import { isBotUserAgent } from './_lib/botUa';
import { buildBodyHtml, buildNoscriptHtml } from './_lib/routeBody';
import { isLocaleLocalised, LOCALISED_LOCALES } from './_lib/localisedLocales';
import { resolveDetailRoute, isDetailPath } from './_lib/detail';
import { resolveLandingRoute } from './_lib/landing';
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

// Path prefixes the route-meta middleware never touches (no HTML to
// rewrite). /assets/ is intentionally NOT in this list any more — the
// middleware *does* look at /assets/ responses to convert HTML SPA
// fallbacks into real 404s.
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
  // file. Refetch /index.html as the SPA shell so React Router can
  // render the route. Detail routes that look like SPA routes but have
  // no matching DB row still 404 — that branch runs after this block.
  if (response.status === 404 && contentType.includes('text/html')) {
    const indexResponse = await env.ASSETS.fetch(
      new URL('/index.html', request.url).toString(),
    );
    if (indexResponse.ok) {
      response = new Response(indexResponse.body, {
        status: 200,
        headers: indexResponse.headers,
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

  // Per-row indexability (P1.1): seo_indexable=false on the row vetoes
  // indexing even if the path is otherwise indexable.
  const indexable =
    pathIndexable && localeIndexable && (detail ? detail.indexable !== false : true);

  // Hard 404 for unknown detail slugs. We only return 404 when the path
  // *looks like* a detail route — for non-detail paths a null detail just
  // means "no override needed" and the SPA renders normally.
  if (!detail && isDetailPath(basePath)) {
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

  const meta = detail?.meta ?? resolveMeta(basePath);
  const canonical = locale ? localizedUrl(locale, basePath) : canonicalUrl(basePath);
  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;
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
    `<link rel="canonical" href="${escapeAttr(canonical)}">`,
    `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}">`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="Queer Guide">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="@queerguide">`,
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
    headInjections.push(homepageJsonLd());
  }
  if (detail?.jsonLd) {
    headInjections.push(detail.jsonLd);
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
};

const NOT_FOUND_KINDS: Record<string, NotFoundKind> = {
  personality: {
    title: 'Personality not found',
    heading: "We couldn't find that personality",
    body: 'The personality you\'re looking for was moved, removed, or never existed.',
    backLabel: 'Back to personalities',
    backHref: '/personalities',
  },
  news: {
    title: 'Article not found',
    heading: "We couldn't find that article",
    body: 'The article you\'re looking for was moved or removed.',
    backLabel: 'Back to news',
    backHref: '/news',
  },
  venue: {
    title: 'Venue not found',
    heading: "We couldn't find that venue",
    body: 'The venue you\'re looking for was moved or removed.',
    backLabel: 'Browse venues',
    backHref: '/venues',
  },
  event: {
    title: 'Event not found',
    heading: "We couldn't find that event",
    body: 'The event you\'re looking for was moved or removed.',
    backLabel: 'Browse events',
    backHref: '/events',
  },
  hotel: {
    title: 'Hotel not found',
    heading: "We couldn't find that hotel",
    body: 'The hotel you\'re looking for was moved or removed.',
    backLabel: 'Browse hotels',
    backHref: '/hotels',
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
  return {
    title: 'Page not found',
    heading: "This page doesn't exist",
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

function notFoundHtml(pathname: string): string {
  const safePath = escapeAttr(pathname);
  const kind = notFoundKindFor(pathname);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeAttr(kind.title)} · Queer Guide</title>
<link rel="canonical" href="https://queer.guide${safePath}">
<style>
  html, body { height: 100%; }
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: #0a0a0a; color: #fafafa; }
  main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
  .card { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { color: #a1a1aa; margin: 0 0 1.5rem; }
  a { color: #fafafa; }
  footer { padding: 1rem; text-align: center; color: #71717a; font-size: 0.875rem; }
</style>
</head>
<body>
<main><div class="card">
<h1>${escapeAttr(kind.heading)}</h1>
<p>${escapeAttr(kind.body)}</p>
<p><a href="${escapeAttr(kind.backHref)}">${escapeAttr(kind.backLabel)}</a> · <a href="/">Home</a></p>
</div></main>
<footer>Queer Guide</footer>
</body>
</html>`;
}

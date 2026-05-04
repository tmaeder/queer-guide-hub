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
 */
import {
  resolveMeta,
  isIndexable,
  DEFAULT_OG_IMAGE,
  splitLocale,
  localizedUrl,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from './_lib/routeMeta';
import { homepageJsonLd } from './_lib/jsonLd';
import { isBotUserAgent } from './_lib/botUa';
import { buildBodyHtml } from './_lib/routeBody';
import { resolveDetailRoute, isDetailPath } from './_lib/detail';
import { resolveLandingRoute } from './_lib/landing';
import type { Env } from './_lib/sitemap';

const SKIP_PREFIXES = ['/api/', '/functions/', '/assets/', '/icons/', '/images/', '/fonts/'];
const SKIP_SUFFIXES = [
  '.js',
  '.css',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.json',
  '.xml',
  '.txt',
  '.woff',
  '.woff2',
];

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

class TitleRewriter {
  constructor(private readonly title: string) {}
  element(el: Element) {
    el.setInnerContent(this.title);
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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const { pathname } = url;

  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return next();
  if (SKIP_SUFFIXES.some((s) => pathname.endsWith(s))) return next();

  // Standalone landing pages (/spaces/:tag, /pride/:year, /pride/:year/:city)
  // bypass the SPA shell entirely and return a complete HTML document.
  const { basePath: landingBasePath } = splitLocale(pathname);
  const landing = await resolveLandingRoute(env, landingBasePath);
  if (landing) return landing;

  const response = await next();
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const { locale, basePath } = splitLocale(pathname);
  const indexable = isIndexable(basePath);

  // Detail routes look up the row in Supabase and override meta/body/JSON-LD.
  // Returns null if the path isn't a detail route OR the row isn't found.
  const detail = await resolveDetailRoute(env, basePath);

  // Hard 404 for unknown detail slugs. We only return 404 when the path
  // *looks like* a detail route — for non-detail paths a null detail just
  // means "no override needed" and the SPA renders normally.
  if (!detail && isDetailPath(basePath)) {
    return new Response(notFoundHtml(basePath), {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, max-age=30',
      },
    });
  }

  const meta = detail?.meta ?? resolveMeta(basePath);
  const canonical = localizedUrl(locale, basePath);
  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;
  // og:type stays 'website' — crawlers rely on JSON-LD @type for fine-grained
  // typing (NewsArticle / Place / Event). og:type=article would be wrong for
  // city/country/venue detail pages.
  const ogType = 'website';

  // Tags appended to <head>. Append (rather than replace) so duplicates from
  // the source HTML are tolerated; crawlers honor the *last* tag.
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
  if (indexable) {
    for (const l of SUPPORTED_LOCALES) {
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
    .on('title', new TitleRewriter(meta.title))
    .on('meta[name="description"]', new MetaContentRewriter(meta.description))
    .on('head', new HeadInjector(headInjections.join('\n    ')));

  const isBot = indexable && isBotUserAgent(request.headers.get('user-agent'));
  if (isBot) {
    const bodyHtml =
      detail?.body ?? buildBodyHtml(basePath, { title: meta.title, description: meta.description });
    rewriter.on('#root', new RootBodyInjector(bodyHtml));
  }

  const rewritten = rewriter.transform(response);

  // Vary on UA so downstream caches don't serve bot HTML to humans.
  if (isBot || indexable) {
    rewritten.headers.append('Vary', 'User-Agent');
  }

  // Detail pages are dynamic but row content changes infrequently — let the
  // edge cache hold for 5 minutes to bound Supabase load.
  if (detail) {
    rewritten.headers.set('Cache-Control', 'public, s-maxage=300, max-age=60');
  }

  return rewritten;
};

function notFoundHtml(pathname: string): string {
  const safePath = escapeAttr(pathname);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Not found · Queer Guide</title>
<link rel="canonical" href="https://queer.guide${safePath}">
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a0a; color: #fafafa; padding: 1.5rem; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { color: #a1a1aa; margin: 0 0 1.5rem; }
  a { color: #fafafa; }
</style>
</head>
<body>
<main>
<h1>This page doesn't exist</h1>
<p>The article or page you're looking for was moved or removed.</p>
<p><a href="/news">Back to news</a> · <a href="/">Home</a></p>
</main>
</body>
</html>`;
}

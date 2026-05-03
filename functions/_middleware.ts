/**
 * Pages middleware: rewrites the SPA shell <head> per route so every URL
 * ships its own <title>, <meta name="description">, <link rel="canonical">,
 * absolute OG/Twitter tags, and (on the homepage) JSON-LD.
 *
 * Phase 2 addition: for crawler user agents on indexable routes, we also
 * inject route-specific body content into <div id="root">. Real users get
 * the SPA shell unchanged; React's createRoot() replaces children on mount,
 * so even when Googlebot's JS-rendering pass runs, the SPA mounts cleanly
 * over the injected content with no hydration mismatch (we use createRoot,
 * not hydrateRoot).
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
import { resolveDetailRoute } from './_lib/detail';
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

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

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
  // bypass the SPA shell entirely and return a complete HTML document. These
  // URLs don't exist as SPA routes, so handing them to the SPA would render
  // 404 — a cloaking risk if we then served different content to bots.
  const { basePath: landingBasePath } = splitLocale(pathname);
  const landing = await resolveLandingRoute(env, landingBasePath);
  if (landing) return landing;

  const response = await next();
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  // Strip the optional /:locale prefix so route resolution operates on the
  // canonical (default-locale) path. Each translated URL keeps its own
  // self-canonical and exposes hreflang alternates to its 10 siblings.
  const { locale, basePath } = splitLocale(pathname);

  // Phase 3: detail routes look up the row in Supabase and override
  // meta/body/JSON-LD with type-specific values (LocalBusiness, Event, etc.).
  // Returns null if the path isn't a detail route or the row isn't found.
  const detail = await resolveDetailRoute(env, basePath);

  const meta = detail?.meta ?? resolveMeta(basePath);
  const canonical = localizedUrl(locale, basePath);
  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;
  const indexable = isIndexable(basePath);

  // Tags appended to <head>. We append rather than replace for og:* / twitter:*
  // because the source HTML may also have them — duplicates are tolerated by
  // crawlers but we want the *last* tag to win, which append guarantees.
  const headInjections: string[] = [
    `<link rel="canonical" href="${escapeAttr(canonical)}">`,
    `<meta property="og:url" content="${escapeAttr(canonical)}">`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}">`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Queer Guide">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="@queerguide">`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`,
  ];

  // hreflang alternates: one link per supported locale, plus x-default. Each
  // locale's URL points to itself; the default locale is no-prefix English.
  if (indexable) {
    for (const l of SUPPORTED_LOCALES) {
      headInjections.push(
        `<link rel="alternate" hreflang="${l}" href="${escapeAttr(localizedUrl(l, basePath))}">`,
      );
    }
    headInjections.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeAttr(localizedUrl(DEFAULT_LOCALE, basePath))}">`,
    );
  }

  if (!indexable) {
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
      detail?.body ??
      buildBodyHtml(basePath, { title: meta.title, description: meta.description });
    rewriter.on('#root', new RootBodyInjector(bodyHtml));
  }

  const rewritten = rewriter.transform(response);

  // We branch on User-Agent for indexable HTML responses, so downstream caches
  // must vary on UA to avoid serving bot HTML to humans (or vice versa).
  if (isBot || indexable) {
    rewritten.headers.append('Vary', 'User-Agent');
  }
  // Detail pages are dynamic but the row content changes infrequently — let
  // the edge cache hold for 5 minutes to bound Supabase load.
  if (detail) {
    rewritten.headers.set('Cache-Control', 'public, s-maxage=300, max-age=60');
  }
  return rewritten;
};

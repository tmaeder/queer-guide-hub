/**
 * Pages middleware: rewrites the SPA shell <head> per route so every URL
 * ships its own <title>, <meta name="description">, <link rel="canonical">,
 * absolute OG/Twitter tags, and (on the homepage) JSON-LD.
 *
 * The SPA still renders client-side; this only fixes the crawler-visible HTML.
 * Pre-rendered body HTML is Phase 2.
 */
import { resolveMeta, canonicalUrl, isIndexable, DEFAULT_OG_IMAGE } from './_lib/routeMeta';
import { homepageJsonLd } from './_lib/jsonLd';

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

export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);
  const { pathname } = url;

  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return next();
  if (SKIP_SUFFIXES.some((s) => pathname.endsWith(s))) return next();

  const response = await next();
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const meta = resolveMeta(pathname);
  const canonical = canonicalUrl(pathname);
  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;
  const indexable = isIndexable(pathname);

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

  if (!indexable) {
    headInjections.push('<meta name="robots" content="noindex,nofollow">');
  }

  if (pathname === '/' || pathname === '') {
    headInjections.push(homepageJsonLd());
  }

  const rewriter = new HTMLRewriter()
    .on('title', new TitleRewriter(meta.title))
    .on('meta[name="description"]', new MetaContentRewriter(meta.description))
    .on('head', new HeadInjector(headInjections.join('\n    ')));

  const rewritten = rewriter.transform(response);

  // Preserve original cache headers but ensure Vary on User-Agent isn't needed
  // since we don't branch on UA in Phase 1.
  return rewritten;
};

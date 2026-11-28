import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { toR2ImageUrl } from '@/utils/imageHost';
import { isSupportedLocale } from '@/i18n/languages';

export interface MetaOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  canonicalPath?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** When true, sets `<meta name="robots" content="noindex,nofollow">`. Cleared on unmount. */
  noIndex?: boolean;
}

const BASE_URL = 'https://queer.guide';

/**
 * Locale-prefixed pages canonicalise to the English URL, same rule as the
 * edge (functions/_middleware.ts): entity content is English-only, so
 * /de/x would otherwise be a self-canonical duplicate of /x.
 */
export function canonicalPathFor(pathname: string): string {
  const [, first, ...rest] = pathname.split('/');
  if (!first || !isSupportedLocale(first)) return pathname;
  return `/${rest.join('/')}`;
}
const DEFAULT_TITLE = 'Queer Guide';
const DEFAULT_DESCRIPTION =
  'Connecting the LGBTQ+ community with safe spaces, events, businesses, and each other.';
const DEFAULT_OG_IMAGE = '/images/og-image.png';

function setMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

// @types where the edge block (functions/_lib/detail.ts) is canonical: when
// the document already carries one for this URL, the app adds no second copy.
const EDGE_CANONICAL_TYPES = new Set([
  'Product',
  'Event',
  'NewsArticle',
  'Article',
  'PodcastSeries',
  'DefinedTerm',
  // functions/_lib/datasetJsonLd.ts (rights pages): its Dataset carries the
  // downloads and source datasets the app's thinner one lacks.
  'Dataset',
]);

/**
 * Edge-rendered JSON-LD (`data-qg-edge="<path>"`, functions/_middleware.ts)
 * describes the URL the document was loaded for. Drop it once the SPA has
 * navigated elsewhere; return the @types still valid for the current URL.
 */
function syncEdgeJsonLd(): Set<string> {
  const here = window.location.pathname;
  const types = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>('script[data-qg-edge]').forEach((el) => {
    if (el.dataset.qgEdge !== here) {
      el.remove();
      return;
    }
    try {
      const type = JSON.parse(el.textContent || '')['@type'];
      if (typeof type === 'string') types.add(type);
    } catch {
      /* not ours to judge */
    }
  });
  return types;
}

function setJsonLd(data: Record<string, unknown> | Record<string, unknown>[]): void {
  // Remove any existing JSON-LD we previously injected
  document.querySelectorAll('script[data-meta-jsonld]').forEach((el) => el.remove());

  const edgeTypes = syncEdgeJsonLd();
  const items = (Array.isArray(data) ? data : [data]).filter((item) => {
    const type = item['@type'];
    return !(typeof type === 'string' && EDGE_CANONICAL_TYPES.has(type) && edgeTypes.has(type));
  });
  items.forEach((item) => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-meta-jsonld', 'true');
    script.textContent = JSON.stringify(item);
    document.head.appendChild(script);
  });
}

/**
 * Sets <title>, meta tags, canonical URL, and optional JSON-LD for the current page.
 * Cleans up JSON-LD on unmount. Title/meta are reset to defaults on unmount so
 * SPA navigation never leaves stale tags behind.
 */
export function useMeta(options: MetaOptions = {}): void {
  const { pathname } = useLocation();

  // Serialized so the effect can depend on the CONTENT of jsonLd rather than
  // the object identity, which is fresh on every render and would loop.
  //
  // Without this dep, `jsonLd` was captured on the first render and never
  // updated — so any page building it from fetched data published the
  // placeholder it had before the fetch resolved. On /help that meant the
  // EmergencyService block never once carried a telephone number: it was
  // computed while the hotline list was still empty.
  const jsonLdKey = options.jsonLd ? JSON.stringify(options.jsonLd) : '';

  useEffect(() => {
    const {
      title,
      description,
      ogTitle,
      ogDescription,
      ogImage,
      ogType = 'website',
      canonicalPath,
      jsonLd,
      noIndex,
    } = options;

    // Pages following the routeMeta convention already carry the "| Queer
    // Guide" suffix (client and edge stay byte-identical) — don't double it.
    const fullTitle = !title
      ? DEFAULT_TITLE
      : title.endsWith(`| ${DEFAULT_TITLE}`)
        ? title
        : `${title} | ${DEFAULT_TITLE}`;
    const desc = description || DEFAULT_DESCRIPTION;
    const canonical = `${BASE_URL}${canonicalPath ?? canonicalPathFor(pathname)}`;

    document.title = fullTitle;

    setMetaTag('name', 'description', desc);
    setMetaTag('property', 'og:title', ogTitle || fullTitle);
    setMetaTag('property', 'og:description', ogDescription || desc);
    setMetaTag('property', 'og:image', toR2ImageUrl(ogImage || DEFAULT_OG_IMAGE));
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:url', canonical);
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', ogTitle || fullTitle);
    setMetaTag('name', 'twitter:description', ogDescription || desc);
    setMetaTag('name', 'twitter:image', toR2ImageUrl(ogImage || DEFAULT_OG_IMAGE));

    setCanonical(canonical);

    if (jsonLd) {
      setJsonLd(jsonLd);
    } else {
      syncEdgeJsonLd();
    }

    // Robots noindex for gated / non-indexable pages (P0-3 age gate, etc.).
    if (noIndex) {
      setMetaTag('name', 'robots', 'noindex,nofollow');
    } else {
      // Make sure no stale noindex carries over from a previous page.
      document.querySelector('meta[name="robots"]')?.remove();
    }

    // Cleanup on unmount — reset to defaults so stale tags don't persist
    return () => {
      document.title = DEFAULT_TITLE;
      setMetaTag('name', 'description', DEFAULT_DESCRIPTION);
      setMetaTag('property', 'og:title', DEFAULT_TITLE);
      setMetaTag('property', 'og:description', DEFAULT_DESCRIPTION);
      setMetaTag('property', 'og:image', DEFAULT_OG_IMAGE);
      setMetaTag('property', 'og:type', 'website');
      setMetaTag('property', 'og:url', BASE_URL);
      setMetaTag('name', 'twitter:title', DEFAULT_TITLE);
      setMetaTag('name', 'twitter:description', DEFAULT_DESCRIPTION);
      setMetaTag('name', 'twitter:image', DEFAULT_OG_IMAGE);
      document.querySelector('meta[name="robots"]')?.remove();
      document.querySelectorAll('script[data-meta-jsonld]').forEach((el) => el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pathname,
    options.title,
    options.description,
    options.canonicalPath,
    options.noIndex,
    jsonLdKey,
  ]);
}

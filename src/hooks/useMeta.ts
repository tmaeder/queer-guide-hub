import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface MetaOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  canonicalPath?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const BASE_URL = 'https://queer.guide';
const DEFAULT_TITLE = 'Queer Guide';
const DEFAULT_DESCRIPTION =
  'Connecting the LGBTQ+ community with safe spaces, events, businesses, and each other.';
const DEFAULT_OG_IMAGE = '/images/og-image.svg';

function setMetaTag(
  attr: 'name' | 'property',
  key: string,
  content: string,
): void {
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

function setJsonLd(data: Record<string, unknown> | Record<string, unknown>[]): void {
  // Remove any existing JSON-LD we previously injected
  document
    .querySelectorAll('script[data-meta-jsonld]')
    .forEach((el) => el.remove());

  const items = Array.isArray(data) ? data : [data];
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
    } = options;

    const fullTitle = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESCRIPTION;
    const canonical = `${BASE_URL}${canonicalPath ?? pathname}`;

    document.title = fullTitle;

    setMetaTag('name', 'description', desc);
    setMetaTag('property', 'og:title', ogTitle || fullTitle);
    setMetaTag('property', 'og:description', ogDescription || desc);
    setMetaTag('property', 'og:image', ogImage || DEFAULT_OG_IMAGE);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:url', canonical);
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', ogTitle || fullTitle);
    setMetaTag('name', 'twitter:description', ogDescription || desc);
    setMetaTag('name', 'twitter:image', ogImage || DEFAULT_OG_IMAGE);

    setCanonical(canonical);

    if (jsonLd) {
      setJsonLd(jsonLd);
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
      document
        .querySelectorAll('script[data-meta-jsonld]')
        .forEach((el) => el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, options.title, options.description, options.canonicalPath]);
}

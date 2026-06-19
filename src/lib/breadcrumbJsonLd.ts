import type { BreadcrumbItem } from '@/contexts/BreadcrumbContext';

const BASE_URL = 'https://queer.guide';

/**
 * Build a schema.org BreadcrumbList from a breadcrumb trail. Only crumbs with
 * a string label are emitted (JSON-LD can't carry React nodes). `item` is set
 * to the absolute URL when a crumb has an href — the current (last) crumb
 * usually omits it, which is valid per Google's BreadcrumbList spec.
 */
export function breadcrumbJsonLd(
  items: BreadcrumbItem[] | null | undefined,
  baseUrl: string = BASE_URL,
): Record<string, unknown> | null {
  if (!items || items.length < 2) return null;
  const named = items.filter((c) => typeof c.label === 'string' && (c.label as string).length > 0);
  if (named.length < 2) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: named.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label as string,
      ...(c.href ? { item: `${baseUrl}${c.href}` } : {}),
    })),
  };
}

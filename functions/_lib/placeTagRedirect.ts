import { placeTagRedirect } from '../../src/lib/placeTagRedirects.ts';

/**
 * Resolve a glossary URL that duplicates a real place entity.
 *
 * Cloudflare Pages currently applies only the first 100 entries from this
 * project's `_redirects` file. The place-tag block crosses that boundary, so
 * middleware must provide the same cold-request 301 for every later entry.
 */
export function placeTagEdgeLocation(
  basePath: string,
  locale: string,
  defaultLocale: string,
  search = '',
): string | null {
  const match = basePath.match(/^\/tags\/([a-z0-9-]+)\/?$/i);
  if (!match) return null;

  const target = placeTagRedirect(match[1]);
  if (!target) return null;

  const localePrefix = locale === defaultLocale ? '' : `/${locale}`;
  return `${localePrefix}${target}${search}`;
}

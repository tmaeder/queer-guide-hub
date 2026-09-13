/**
 * The one place that knows how to cross between a public page and its CMS
 * record, in both directions.
 *
 * Before this, the two directions were built independently and neither
 * crossed: a public page could open an in-place edit sheet but not reach the
 * CMS, and the CMS could iframe a preview but had no "view live" link. Three
 * partial entity->route maps had grown in the meantime
 * (`contentGraphMeta.TYPE_META.adminHref`, `MediaLibrary/utils.entityAdminPath`,
 * `searchRoutes.ROUTE_HREFS`), each covering a different subset.
 *
 * Both functions return `null` rather than guessing. That is the discipline
 * `searchRoutes.detailHref` already follows — a fabricated URL is a 404 the
 * caller cannot distinguish from a real page, so "no public page" has to be
 * representable.
 */

import { contentTypeRegistry, getContentType } from '@/config/contentTypes';

/**
 * Admin CMS path for one record: the type's list route plus `?edit=<id>`,
 * which `ContentListPanel` consumes to open the editor.
 *
 * There is deliberately no `/admin/content/:type/:id` route — the record
 * editor is a modal owned by `AdminShell` (`openEditor`), so a URL that
 * "opens the editor" has to be a query param on the list route.
 *
 * Returns null for an unknown registry key, so a caller with a stale type
 * string renders nothing instead of linking to the "All content" list (which
 * is what an unknown `/admin/content/<key>` silently falls back to).
 */
export function cmsEditPath(registryKey: string, id: string): string | null {
  if (!id) return null;
  if (!getContentType(registryKey)) return null;
  return `/admin/content/${registryKey}?edit=${encodeURIComponent(id)}`;
}

/** Admin CMS list path for a type. Null for an unknown registry key. */
export function cmsListPath(registryKey: string): string | null {
  if (!getContentType(registryKey)) return null;
  return `/admin/content/${registryKey}`;
}

/**
 * Public path for a row, or null when it has no public page.
 *
 * Delegates to the registry's own `publicPath`, which is the existing
 * contract used by the editor preview iframe. The path is NOT locale-prefixed
 * — callers that navigate add the prefix (`LocalizedLink` /
 * `useLocalizedNavigate`), matching what `PreviewPanel` already does.
 *
 * Null is returned for two different, both legitimate, reasons: the type has
 * no public page at all (the seven vocabularies, `redirects`, `feedback`), or
 * this particular row is not publishable yet (no slug, or a status that keeps
 * it off the site — an unapproved brand, a non-active tag).
 */
export function livePath(
  registryKey: string,
  row: Record<string, unknown> | null | undefined,
): string | null {
  if (!row) return null;
  const config = getContentType(registryKey);
  if (!config?.publicPath) return null;
  return config.publicPath(row) ?? null;
}

/** True when this content type can ever have a public page. */
export function hasPublicPage(registryKey: string): boolean {
  return Boolean(getContentType(registryKey)?.publicPath);
}

/** Registry keys that declare a `publicPath`. Used by the guard test. */
export function typesWithPublicPath(): string[] {
  return Object.keys(contentTypeRegistry).filter((key) => hasPublicPage(key));
}

import DOMPurify from 'dompurify';

/**
 * The single sanitize config for CMS document bodies.
 *
 * Three call sites used to sanitize `cms_pages.body_html` independently and had
 * drifted: CMSRoutePage allowed `id` attributes (so heading anchors and the
 * legal-page TOC worked) while Page.tsx and HelpHotlines stripped them.
 * Unifying on the more capable config is strictly additive — `id` is inert, and
 * DOMPurify still removes scripts, event handlers and unsafe URLs.
 *
 * Lives outside the component file so it can be imported without pulling in
 * React (and so the component file stays fast-refresh clean).
 */

/** Attributes preserved beyond DOMPurify's defaults. `id` powers in-page anchors. */
const ADD_ATTR = ['id'];

/**
 * Sanitizes CMS body HTML. Exported separately from `<CMSBody>` for callers that
 * need the string rather than the element — the legal-page TOC parses headings
 * out of it before render.
 */
export function sanitizeCmsHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ADD_ATTR });
}

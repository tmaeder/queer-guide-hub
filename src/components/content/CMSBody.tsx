import { useState } from 'react';
import { sanitizeCmsHtml } from '@/lib/cms/sanitizeCmsHtml';
import { DatabaseBlockHydrator } from './DatabaseBlockHydrator';

/**
 * The single render path for CMS document bodies (`cms_pages.body_html`).
 *
 * This is also the mount point for interactive blocks embedded in a document.
 * Rather than reimplementing a ProseMirror renderer for the public site, the
 * stored HTML keeps rendering as-is and React portals into the placeholder
 * elements it contains. Keeping that in one component is what makes it
 * possible to add without touching every page.
 *
 * `className` stays per-call-site: the surfaces use genuinely different
 * typography (`qg-cms-body`, `qg-help-intro`, Tailwind `prose`).
 */

export interface CMSBodyProps {
  /** Raw `body_html` from the CMS. Sanitized here unless `preSanitized` is set. */
  html: string | null | undefined;
  /** Typography wrapper for the surface. */
  className?: string;
  /** Set when the caller already sanitized via `sanitizeCmsHtml` (TOC path). */
  preSanitized?: boolean;
  /** Page slug, so an edge-seeded entity payload can be matched to this page. */
  pageSlug?: string;
}

export function CMSBody({ html, className, preSanitized = false, pageSlug }: CMSBodyProps) {
  // Callback ref rather than useRef: the hydrator must re-run when the node is
  // attached, and a ref object mutation does not trigger that.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const safeHtml = preSanitized ? (html ?? '') : sanitizeCmsHtml(html);
  if (!safeHtml) return null;

  return (
    <>
      <div
        ref={setContainer}
        className={className}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
      <DatabaseBlockHydrator container={container} pageSlug={pageSlug} html={safeHtml} />
    </>
  );
}

/**
 * TagWikiContent — the editorial body of a glossary entry.
 *
 * Now a thin wrapper. Everything it used to do by hand is shared:
 *
 * - Heading ids and the station list come from `extractSections`
 *   (src/lib/htmlSections.ts). The old local version numbered ids positionally
 *   (`section-0`, `section-1`, …), so inserting a heading silently retargeted
 *   every deep link below it, and its regex had no `s` flag, so any heading
 *   containing a newline was skipped.
 * - Typography comes from `.qg-cms-body` in index.css — the same prose system
 *   the CMS pages use — instead of a 20-selector `[&_h2]:…` class string.
 * - The html is sanitized. It was rendered raw on the argument that Tiptap
 *   output is already clean server-side, while CMSRoutePage sanitized the same
 *   class of content.
 *
 * Callers pass `htmlWithIds` from their own `extractSections` memo, so the
 * document is parsed once per tag rather than once per component.
 */

import DOMPurify from 'dompurify';
import { useMemo } from 'react';

export function TagWikiContent({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, { ADD_ATTR: ['id'] }), [html]);
  return <div className="qg-cms-body" dangerouslySetInnerHTML={{ __html: clean }} />;
}

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
import { useGlossaryLinkVocabulary } from '@/hooks/useGlossaryLinkVocabulary';
import { findGlossaryLinks, glossaryHref, type GlossaryLinkTerm } from '@/lib/glossaryLinks';

/**
 * Elements whose text must never be turned into a glossary link: an anchor
 * (nested `<a>` is invalid HTML and axe `nested-interactive`), a heading (a
 * link inside a station title fights the route strip), and code, where the
 * words are identifiers rather than prose.
 */
const SKIP_ELEMENTS = new Set(['A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'CODE', 'PRE', 'BUTTON']);

/**
 * Inject glossary links into an already-sanitized document.
 *
 * Runs AFTER DOMPurify, deliberately: the anchors this adds are ours and must
 * not be re-examined as if they came from the stored html — and, the other way
 * round, matching before sanitizing would let markup in the source split a term
 * and hide it. The whole document is matched as ONE text run so that
 * first-mention-only and the per-document cap mean what they say; matching per
 * node would re-link the same term in every paragraph.
 */
function linkifyDocument(
  root: Document,
  vocabulary: readonly GlossaryLinkTerm[],
  currentSlug?: string | null,
): void {
  if (vocabulary.length === 0) return;

  const walker = root.createTreeWalker(root.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el && el !== root.body) {
        if (SKIP_ELEMENTS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return node.nodeValue && node.nodeValue.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) textNodes.push(n as Text);
  if (textNodes.length === 0) return;

  // Match against the concatenated text so the document, not the node, is the
  // unit the cap and the first-mention rule apply to. Offsets map back to the
  // node that owns them.
  const full = textNodes.map((n) => n.nodeValue ?? '').join('');
  const spans = findGlossaryLinks(full, vocabulary, { currentSlug });
  if (spans.length === 0) return;

  // Apply right-to-left: splitting a node invalidates later offsets within it,
  // and working backwards means every offset still refers to untouched text.
  const starts: number[] = [];
  let offset = 0;
  for (const node of textNodes) {
    starts.push(offset);
    offset += (node.nodeValue ?? '').length;
  }

  for (const span of [...spans].reverse()) {
    const index = starts.findLastIndex((start) => start <= span.start);
    if (index < 0) continue;
    const node = textNodes[index];
    const localStart = span.start - starts[index];
    const localEnd = localStart + span.label.length;
    // A term straddling two text nodes (split by an inline `<em>`) is skipped
    // rather than half-linked.
    if (localEnd > (node.nodeValue ?? '').length) continue;

    const tail = node.splitText(localStart);
    tail.splitText(span.label.length);
    const anchor = root.createElement('a');
    anchor.setAttribute('href', glossaryHref(span.slug));
    anchor.setAttribute('data-glossary-link', span.slug);
    anchor.textContent = tail.nodeValue ?? span.label;
    tail.parentNode?.replaceChild(anchor, tail);
  }
}

export function TagWikiContent({
  html,
  currentSlug,
}: {
  html: string;
  /** Slug of the entry being rendered — it never links to itself. */
  currentSlug?: string | null;
}) {
  const vocabulary = useGlossaryLinkVocabulary();

  const clean = useMemo(() => {
    const sanitized = DOMPurify.sanitize(html, { ADD_ATTR: ['id'] });
    if (vocabulary.length === 0) return sanitized;
    try {
      const doc = new DOMParser().parseFromString(`<body>${sanitized}</body>`, 'text/html');
      linkifyDocument(doc, vocabulary, currentSlug);
      return doc.body.innerHTML;
    } catch {
      // Prose must render even if the link pass fails.
      return sanitized;
    }
  }, [html, vocabulary, currentSlug]);

  return <div className="qg-cms-body" dangerouslySetInnerHTML={{ __html: clean }} />;
}

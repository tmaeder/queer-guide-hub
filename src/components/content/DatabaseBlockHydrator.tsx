import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DatabaseViewController } from './database-block/DatabaseViewController';
import {
  DEFAULT_VIEW_STATE,
  sanitizeBlockAttrs,
  type BlockViewState,
  type DatabaseBlockAttrs,
} from '@/lib/databaseBlock/schema';

/**
 * Renders live database blocks inside already-sanitized CMS HTML.
 *
 * The public site keeps rendering `body_html` through dangerouslySetInnerHTML.
 * Rather than writing a second ProseMirror-to-React renderer for the reader
 * path — which would mean reimplementing ~15 node types and pulling the whole
 * tiptap chunk onto /terms — this finds the placeholder <div>s the block
 * serializer left behind and portals React into them.
 *
 * That keeps the legal-page TOC regex, TagWikiContent's heading injection and
 * the prose typography untouched, and means a page with no blocks costs one
 * querySelectorAll and nothing else.
 *
 * The crawlable <ul> the serializer wrote into each placeholder stays in the
 * DOM until React replaces it, so a crawler (and a reader with JS disabled)
 * still sees real links.
 */

interface MountedBlock {
  element: HTMLElement;
  attrs: DatabaseBlockAttrs;
}

interface DatabaseBlockHydratorProps {
  /** The element whose subtree holds the sanitized CMS HTML. */
  container: HTMLElement | null;
  /** Slug currently rendering; guards the edge seed against a bfcache bleed. */
  pageSlug?: string;
  /** Re-scan key — change it when the HTML is replaced. */
  html?: string | null;
}

/** Reads block attributes back out of the placeholder's data-* attributes. */
function readAttrs(element: HTMLElement): DatabaseBlockAttrs {
  const parse = (name: string): unknown => {
    const raw = element.getAttribute(name);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  return sanitizeBlockAttrs({
    blockId: element.getAttribute('data-block-id') ?? '',
    entityType: element.getAttribute('data-entity-type') ?? undefined,
    source: parse('data-source'),
    viewState: parse('data-view-state'),
    snapshot: parse('data-snapshot'),
  });
}

export function DatabaseBlockHydrator({
  container,
  pageSlug,
  html,
}: DatabaseBlockHydratorProps): ReactNode {
  const [blocks, setBlocks] = useState<MountedBlock[]>([]);

  /*
   * Scanning the rendered DOM is exactly the "synchronize with an external
   * system" case effects exist for — the placeholders are produced by
   * dangerouslySetInnerHTML, so they cannot be known during render. The
   * updates below are identity-preserving when nothing changed, so the
   * overwhelmingly common case (a page with no blocks) costs one
   * querySelectorAll and zero extra renders.
   */
  useEffect(() => {
    const clear = () => setBlocks((prev) => (prev.length === 0 ? prev : []));

    if (!container) {
      clear();
      return;
    }

    const elements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-block-id][data-entity-type]'),
    );

    if (elements.length === 0) {
      clear();
      return;
    }

    for (const element of elements) {
      // Clear the crawlable fallback only now that React is about to take over,
      // so it is present for crawlers and for anyone whose JS never runs.
      element.replaceChildren();
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM synchronization; see above
    setBlocks(elements.map((element) => ({ element, attrs: readAttrs(element) })));
  }, [container, html]);

  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map(({ element, attrs }) =>
        createPortal(
          <PublicDatabaseBlock attrs={attrs} pageSlug={pageSlug} />,
          element,
          attrs.blockId,
        ),
      )}
    </>
  );
}

/**
 * A block on the reader's side.
 *
 * View state is local: a reader may re-sort or filter for themselves, but that
 * is a private lens and must never be written back to the document.
 */
function PublicDatabaseBlock({
  attrs,
  pageSlug,
}: {
  attrs: DatabaseBlockAttrs;
  pageSlug?: string;
}) {
  const [viewState, setViewState] = useState<BlockViewState>(
    attrs.viewState ?? DEFAULT_VIEW_STATE,
  );

  return (
    <DatabaseViewController
      blockId={attrs.blockId}
      entityType={attrs.entityType}
      source={attrs.source}
      viewState={viewState}
      onViewStateChange={setViewState}
      pageSlug={pageSlug}
    />
  );
}

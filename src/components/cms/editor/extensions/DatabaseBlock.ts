import { Node, mergeAttributes } from '@tiptap/core';
import {
  DATABASE_BLOCK_NODE_NAME,
  DEFAULT_SOURCE,
  DEFAULT_VIEW_STATE,
  SCHEMA_VERSION,
  sanitizeSnapshot,
  sanitizeSource,
  sanitizeViewState,
  type BlockSource,
  type BlockViewState,
  type EntityType,
  type SnapshotEntry,
} from '@/lib/databaseBlock/schema';

/**
 * The `databaseBlock` ProseMirror node.
 *
 * An atom: it has no editable content of its own, so the cursor treats it as a
 * single unit and ProseMirror never tries to place a selection inside the
 * React-rendered layouts.
 *
 * Each field of DatabaseBlockAttrs is its own PM attribute rather than one
 * opaque blob, so `updateAttributes({ viewState })` stays a cheap targeted
 * write and the document walker can read fields without parsing everything.
 *
 * Every attribute round-trips through a `data-*` attribute as JSON and is put
 * back through the schema sanitizers on parse. That matters because the HTML
 * form is what survives in `body_html`, passes through DOMPurify, and can be
 * hand-edited — a mangled attribute must degrade to a default, never throw
 * inside ProseMirror's parser and take the whole document render down.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseBlock: {
      insertDatabaseBlock: (options?: {
        entityType?: EntityType;
        source?: BlockSource;
      }) => ReturnType;
    };
  }
}

/**
 * A JSON-valued attribute persisted in a `data-*` attribute.
 *
 * `key` is passed explicitly rather than reverse-looked-up from the data name,
 * so renaming one cannot silently break the other.
 */
function jsonAttr<T>(key: string, dataName: string, fallback: T, sanitize: (v: unknown) => T) {
  return {
    default: fallback,
    parseHTML: (element: HTMLElement): T => {
      const raw = element.getAttribute(dataName);
      if (!raw) return fallback;
      try {
        return sanitize(JSON.parse(raw));
      } catch {
        return fallback;
      }
    },
    renderHTML: (attributes: Record<string, unknown>): Record<string, string> => ({
      [dataName]: JSON.stringify(attributes[key] ?? fallback),
    }),
  };
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Detail route per entity type; mirrors normalize.detailHrefFor. */
const ROUTE_PREFIX: Record<string, string> = {
  venue: '/venues',
  event: '/events',
  marketplace: '/marketplace',
  city: '/city',
  country: '/country',
  queer_village: '/villages',
  personality: '/people',
  news: '/news',
  milestone: '/milestones',
  group: '/groups',
  organization: '/organizations',
};

/**
 * The crawlable fallback baked into `body_html`.
 *
 * Public pages render stored HTML and portal React into this placeholder, so
 * without a list here a crawler (and a reader with JS disabled) would see an
 * empty div. The snapshot is written by the editor and is guaranteed by
 * sanitizeSnapshot to exclude safety-gated entities and to be empty for query
 * blocks, whose membership is dynamic.
 */
function snapshotListHtml(snapshot: SnapshotEntry[]): string {
  if (!snapshot.length) return '';
  const items = snapshot
    .map((entry) => {
      const prefix = ROUTE_PREFIX[entry.t];
      const name = escapeHtml(entry.n);
      if (!prefix || !entry.s) return `<li>${name}</li>`;
      return `<li><a href="${prefix}/${escapeHtml(entry.s)}">${name}</a></li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

export const DatabaseBlock = Node.create({
  name: DATABASE_BLOCK_NODE_NAME,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-block-id') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-block-id': String(attrs.blockId ?? ''),
        }),
      },
      entityType: {
        default: 'venue' as EntityType,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-entity-type') ?? 'venue',
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-entity-type': String(attrs.entityType ?? 'venue'),
        }),
      },
      source: jsonAttr<BlockSource>('source', 'data-source', DEFAULT_SOURCE, sanitizeSource),
      viewState: jsonAttr<BlockViewState>(
        'viewState',
        'data-view-state',
        DEFAULT_VIEW_STATE,
        sanitizeViewState,
      ),
      snapshot: {
        default: [] as SnapshotEntry[],
        parseHTML: (el: HTMLElement): SnapshotEntry[] => {
          const raw = el.getAttribute('data-snapshot');
          if (!raw) return [];
          try {
            const source = sanitizeSource(JSON.parse(el.getAttribute('data-source') ?? 'null'));
            return sanitizeSnapshot(JSON.parse(raw), source);
          } catch {
            return [];
          }
        },
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-snapshot': JSON.stringify(attrs.snapshot ?? []),
        }),
      },
      schemaVersion: {
        default: SCHEMA_VERSION,
        parseHTML: () => SCHEMA_VERSION,
        renderHTML: () => ({ 'data-schema-version': String(SCHEMA_VERSION) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-id][data-entity-type]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // An atom has no content hole, and ProseMirror's renderer cannot emit raw
    // markup, so the crawlable <ul> is spliced into the serialized string by
    // injectSnapshotLists() on save. Keeping it out of here also keeps a
    // duplicate list from rendering under the React nodeview in the editor.
    return ['div', mergeAttributes(HTMLAttributes, { class: 'qg-database-block' })];
  },

  addCommands() {
    return {
      insertDatabaseBlock:
        (options = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: DATABASE_BLOCK_NODE_NAME,
            attrs: {
              // crypto.randomUUID is available in every browser this app targets.
              blockId: crypto.randomUUID(),
              entityType: options.entityType ?? 'venue',
              source: options.source ?? DEFAULT_SOURCE,
              viewState: DEFAULT_VIEW_STATE,
              snapshot: [],
              schemaVersion: SCHEMA_VERSION,
            },
          }),
    };
  },
});

/**
 * Injects the crawlable snapshot list into serialized HTML.
 *
 * Tiptap's `getHTML()` cannot emit raw markup from renderHTML, so the list is
 * spliced in afterwards, on save. Keeping it out of renderHTML also keeps the
 * editor DOM free of a duplicate list underneath the React nodeview.
 *
 * Uses a parser rather than a regex: an entity title containing `>` puts that
 * character inside the data-snapshot attribute value, which defeats any
 * `<div[^>]*>` pattern and would silently drop the list — exactly the case
 * where a crawler ends up seeing an empty block.
 */
export function injectSnapshotLists(html: string): string {
  if (!html.includes('qg-database-block')) return html;
  if (typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const blocks = doc.body.querySelectorAll('.qg-database-block');
  if (blocks.length === 0) return html;

  for (const block of Array.from(blocks)) {
    const raw = block.getAttribute('data-snapshot');
    if (!raw) continue;
    try {
      const entries = JSON.parse(raw) as SnapshotEntry[];
      // getAttribute already returns the decoded value, so no manual unescaping.
      block.innerHTML = snapshotListHtml(entries);
    } catch {
      // Leave the block empty rather than failing the whole save.
    }
  }

  return doc.body.innerHTML;
}

export { snapshotListHtml };

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import DOMPurify from 'dompurify';
import { DatabaseBlock, injectSnapshotLists } from '../DatabaseBlock';
import { DATABASE_BLOCK_NODE_NAME } from '@/lib/databaseBlock/schema';
import { parseDatabaseBlocks } from '@/lib/databaseBlock/parse';

/**
 * Unlike every other Tiptap test in this repo — which mock `useEditor` away
 * entirely — this one drives a REAL ProseMirror document. The whole point is to
 * prove that updateAttributes actually mutates the persisted JSON, which a
 * mocked editor cannot demonstrate.
 *
 * A minimal extension set is used rather than StarterKit: StarterKit pulls in
 * extensions that touch layout APIs jsdom does not implement.
 */

beforeAll(() => {
  // ProseMirror's EditorView calls these during construction and selection.
  // jsdom implements none of them.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  }
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }
});

const VENUE_A = '11111111-1111-4111-8111-111111111111';
const VENUE_B = '22222222-2222-4222-8222-222222222222';

let editor: Editor | null = null;

function makeEditor(content?: unknown): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [Document, Paragraph, Text, DatabaseBlock],
    content: (content ?? {
      type: 'doc',
      content: [
        {
          type: DATABASE_BLOCK_NODE_NAME,
          attrs: {
            blockId: 'block-1',
            entityType: 'venue',
            source: { kind: 'ids', ids: [VENUE_A, VENUE_B] },
            viewState: {
              activeLayout: 'list',
              sortConfig: { field: 'manual', dir: 'asc' },
              filters: {},
              search: '',
              groupByField: 'category',
              dateStartField: 'start_date',
              dateEndField: 'end_date',
            },
            snapshot: [],
            schemaVersion: 1,
          },
        },
      ],
    }) as never,
  });
  return editor;
}

/** attrs of the first database block in the current document JSON. */
function blockAttrs(ed: Editor): Record<string, unknown> {
  const doc = ed.getJSON() as { content?: { type: string; attrs?: Record<string, unknown> }[] };
  const node = doc.content?.find((n) => n.type === DATABASE_BLOCK_NODE_NAME);
  if (!node?.attrs) throw new Error('no database block in document');
  return node.attrs;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('updateAttributes persists view state into the document JSON', () => {
  it('mutates activeLayout', () => {
    const ed = makeEditor();
    expect((blockAttrs(ed).viewState as { activeLayout: string }).activeLayout).toBe('list');

    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      viewState: { ...(blockAttrs(ed).viewState as object), activeLayout: 'kanban' },
    });

    expect((blockAttrs(ed).viewState as { activeLayout: string }).activeLayout).toBe('kanban');
  });

  it('mutates filters', () => {
    const ed = makeEditor();
    expect((blockAttrs(ed).viewState as { filters: object }).filters).toEqual({});

    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      viewState: {
        ...(blockAttrs(ed).viewState as object),
        filters: { city: ['Berlin'], is_featured: true },
      },
    });

    expect((blockAttrs(ed).viewState as { filters: object }).filters).toEqual({
      city: ['Berlin'],
      is_featured: true,
    });
  });

  it('mutates activeLayout and filters together, leaving other attrs intact', () => {
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      viewState: {
        ...(blockAttrs(ed).viewState as object),
        activeLayout: 'calendar',
        filters: { country: ['Germany'] },
      },
    });

    const attrs = blockAttrs(ed);
    const viewState = attrs.viewState as { activeLayout: string; filters: object; search: string };
    expect(viewState.activeLayout).toBe('calendar');
    expect(viewState.filters).toEqual({ country: ['Germany'] });
    // The rest of the block must be untouched by a view-state write.
    expect(attrs.blockId).toBe('block-1');
    expect(attrs.source).toEqual({ kind: 'ids', ids: [VENUE_A, VENUE_B] });
    expect(viewState.search).toBe('');
  });

  it('survives a JSON round-trip, which is how the document is stored', () => {
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      viewState: { ...(blockAttrs(ed).viewState as object), activeLayout: 'timeline' },
    });

    const serialized = JSON.parse(JSON.stringify(ed.getJSON()));
    const [parsed] = parseDatabaseBlocks(serialized);
    expect(parsed.viewState.activeLayout).toBe('timeline');
    expect(parsed.entityIds).toEqual([VENUE_A, VENUE_B]);
  });
});

describe('HTML round-trip', () => {
  it('preserves attributes through getHTML → DOMPurify → re-parse', () => {
    // body_html is a real storage path: it is sanitized and re-rendered, and the
    // block must survive it rather than degrading to defaults.
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      viewState: {
        ...(blockAttrs(ed).viewState as object),
        activeLayout: 'gallery',
        filters: { city: ['Berlin'] },
      },
    });

    const html = ed.getHTML();
    const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['id'] });
    expect(clean).toContain('data-block-id');
    expect(clean).toContain('data-view-state');

    const reparsed = makeEditor(clean);
    const attrs = blockAttrs(reparsed);
    expect(attrs.blockId).toBe('block-1');
    expect(attrs.entityType).toBe('venue');
    expect((attrs.viewState as { activeLayout: string }).activeLayout).toBe('gallery');
    expect((attrs.viewState as { filters: object }).filters).toEqual({ city: ['Berlin'] });
    expect(attrs.source).toEqual({ kind: 'ids', ids: [VENUE_A, VENUE_B] });
  });

  it('degrades a mangled attribute to defaults instead of throwing', () => {
    const mangled =
      '<div data-block-id="b" data-entity-type="venue" data-source="{not json" ' +
      'data-view-state="{{{" data-snapshot="nope"></div>';
    expect(() => makeEditor(mangled)).not.toThrow();
    const attrs = blockAttrs(editor!);
    expect(attrs.source).toEqual({ kind: 'ids', ids: [] });
    expect((attrs.viewState as { activeLayout: string }).activeLayout).toBe('list');
    expect(attrs.snapshot).toEqual([]);
  });
});

describe('crawlable snapshot', () => {
  it('emits real links into the serialized HTML', () => {
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      snapshot: [
        { t: 'venue', id: VENUE_A, s: 'berghain', n: 'Berghain' },
        { t: 'venue', id: VENUE_B, s: 'so36', n: 'SO36' },
      ],
    });

    const html = injectSnapshotLists(ed.getHTML());
    expect(html).toContain('<a href="/venues/berghain">Berghain</a>');
    expect(html).toContain('<a href="/venues/so36">SO36</a>');
  });

  it('escapes snapshot text so a title cannot inject markup into the list', () => {
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      snapshot: [{ t: 'venue', id: VENUE_A, s: 'x', n: '<script>alert(1)</script>' }],
    });

    const html = injectSnapshotLists(ed.getHTML());

    // The rendered list is the part a browser parses as markup, so that is what
    // must be escaped. (The same text also appears inside the data-snapshot
    // attribute value, where it is inert — browsers do not parse elements out
    // of attribute values.)
    const list = /<ul>.*<\/ul>/s.exec(html)?.[0] ?? '';
    expect(list).not.toBe('');
    expect(list).not.toContain('<script>');
    expect(list).toContain('&lt;script&gt;');
  });

  it('keeps a quote in a title from breaking out of the data attribute', () => {
    // Breaking out of the attribute WOULD be a real injection, so pin it.
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      snapshot: [{ t: 'venue', id: VENUE_A, s: 'x', n: '" onload="alert(1)' }],
    });

    const html = ed.getHTML();
    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain('&quot;');

    // And it still round-trips back to the original string.
    const reparsed = makeEditor(html);
    expect((blockAttrs(reparsed).snapshot as { n: string }[])[0].n).toBe('" onload="alert(1)');
  });

  it('renders an unlinked item when the entity has no slug', () => {
    const ed = makeEditor();
    ed.commands.updateAttributes(DATABASE_BLOCK_NODE_NAME, {
      snapshot: [{ t: 'venue', id: VENUE_A, s: null, n: 'Unnamed' }],
    });
    const html = injectSnapshotLists(ed.getHTML());
    expect(html).toContain('<li>Unnamed</li>');
  });

  it('leaves html without a block untouched', () => {
    expect(injectSnapshotLists('<p>hello</p>')).toBe('<p>hello</p>');
  });
});

describe('insertDatabaseBlock', () => {
  it('inserts a block with a unique id and valid defaults', () => {
    const ed = new Editor({
      element: document.createElement('div'),
      extensions: [Document, Paragraph, Text, DatabaseBlock],
      content: { type: 'doc', content: [{ type: 'paragraph' }] } as never,
    });
    editor = ed;

    ed.commands.insertDatabaseBlock({ entityType: 'event' });

    const attrs = blockAttrs(ed);
    expect(attrs.entityType).toBe('event');
    expect(String(attrs.blockId)).toMatch(/^[0-9a-f-]{36}$/);
    expect(attrs.source).toEqual({ kind: 'ids', ids: [] });
    expect(attrs.snapshot).toEqual([]);
  });
});

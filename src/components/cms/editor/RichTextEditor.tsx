import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image as ImageExt } from '@tiptap/extension-image';
import { Link as LinkExt } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Youtube } from '@tiptap/extension-youtube';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { cn } from '@/lib/utils';
import { EditorToolbar } from './EditorToolbar';
import { DatabaseBlockWithView } from './extensions/DatabaseBlockWithView';
import { injectSnapshotLists } from './extensions/DatabaseBlock';

/* ------------------------------------------------------------------ */
/*  Create lowlight instance with common languages                     */
/* ------------------------------------------------------------------ */

const lowlight = createLowlight(common);

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface RichTextEditorProps {
  /**
   * Initial content: an HTML string or a Tiptap JSON document. Most callers
   * bind this to a plain `text` column and therefore pass HTML.
   */
  value?: string | Record<string, unknown> | null;
  /**
   * Called on every content change with BOTH representations. Callers writing
   * to a `text` column must persist the second argument (`html`) — persisting
   * the first writes a ProseMirror object into a text column.
   */
  onChange?: (json: Record<string, unknown>, html: string) => void;
  /** Placeholder text shown when editor is empty */
  placeholder?: string;
  /** Whether the editor is editable (default true) */
  editable?: boolean;
  /** Extra class names for the outermost wrapper */
  className?: string;
  /** Minimum height of the editor area (CSS value, default "200px") */
  minHeight?: string;
  /**
   * Enables the `databaseBlock` node and its toolbar control.
   *
   * Off by default: the ~13 fields bound to plain `text` columns cannot store a
   * block, so offering one there would let an editor author content that
   * silently degrades on save. Only a jsonb-backed document field turns it on.
   */
  enableDatabaseBlock?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing...',
  editable = true,
  className,
  minHeight = '200px',
  enableDatabaseBlock = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    editable,
    content: value ?? undefined,
    extensions: [
      ...(enableDatabaseBlock ? [DatabaseBlockWithView] : []),
      StarterKit.configure({
        // Disable the built-in codeBlock in favour of CodeBlockLowlight
        codeBlock: false,
      }),
      ImageExt.configure({
        HTMLAttributes: { style: 'max-width:100%;height:auto;border-radius:6px;' },
      }),
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Color,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({
        HTMLAttributes: {
          style: 'max-width:100%;aspect-ratio:16/9;width:100%;height:auto;border-radius:6px;',
        },
      }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    onUpdate: ({ editor: ed }) => {
      // Database blocks serialize to an empty placeholder div; the crawlable
      // <ul> of entity links is spliced in here, so whatever is persisted as
      // body_html carries real links rather than an empty shell.
      const html = enableDatabaseBlock ? injectSnapshotLists(ed.getHTML()) : ed.getHTML();
      onChange?.(ed.getJSON() as Record<string, unknown>, html);
    },
  });

  return (
    <div
      className={cn(
        'border border-border rounded-element overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15',
        className,
      )}
    >
      {/* Toolbar */}
      {editable && <EditorToolbar editor={editor} enableDatabaseBlock={enableDatabaseBlock} />}

      {/* Editor content area */}
      <div
        className="px-4 py-4 overflow-y-auto rich-text-content"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

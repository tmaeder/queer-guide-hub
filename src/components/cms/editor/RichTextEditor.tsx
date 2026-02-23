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
import Box from '@mui/material/Box';
import { cn } from '@/lib/utils';
import { EditorToolbar } from './EditorToolbar';

/* ------------------------------------------------------------------ */
/*  Create lowlight instance with common languages                     */
/* ------------------------------------------------------------------ */

const lowlight = createLowlight(common);

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface RichTextEditorProps {
  /** Tiptap JSON document */
  value?: Record<string, unknown>;
  /** Called on every content change with both JSON and HTML */
  onChange?: (json: Record<string, unknown>, html: string) => void;
  /** Placeholder text shown when editor is empty */
  placeholder?: string;
  /** Whether the editor is editable (default true) */
  editable?: boolean;
  /** Extra class names for the outermost wrapper */
  className?: string;
  /** Minimum height of the editor area (CSS value, default "200px") */
  minHeight?: string;
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
}: RichTextEditorProps) {
  const editor = useEditor({
    editable,
    content: value ?? undefined,
    extensions: [
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
      onChange?.(ed.getJSON() as Record<string, unknown>, ed.getHTML());
    },
  });

  return (
    <Box
      className={cn(className)}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: '8px',
        overflow: 'hidden',
        '&:focus-within': {
          borderColor: 'primary.main',
          boxShadow: (theme) =>
            `0 0 0 2px ${
              theme.palette.mode === 'dark'
                ? 'rgba(144,202,249,0.25)'
                : 'rgba(25,118,210,0.15)'
            }`,
        },
      }}
    >
      {/* Toolbar */}
      {editable && <EditorToolbar editor={editor} />}

      {/* Editor content area */}
      <Box
        sx={{
          minHeight,
          px: 2,
          py: 1.5,
          overflowY: 'auto',

          /* ── Tiptap prose styles ────────────────────────── */
          '& .tiptap': {
            outline: 'none',
            minHeight: 'inherit',
          },

          /* Placeholder */
          '& .tiptap p.is-editor-empty:first-of-type::before': {
            content: 'attr(data-placeholder)',
            float: 'left',
            color: 'text.disabled',
            pointerEvents: 'none',
            height: 0,
          },

          /* Prose resets */
          '& .tiptap > * + *': { mt: 1 },

          '& .tiptap h1': { fontSize: '2rem', fontWeight: 700, lineHeight: 1.2, mt: 3, mb: 1 },
          '& .tiptap h2': { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25, mt: 2.5, mb: 1 },
          '& .tiptap h3': { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3, mt: 2, mb: 0.75 },
          '& .tiptap h4': { fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.35, mt: 1.5, mb: 0.5 },

          '& .tiptap p': { fontSize: '1rem', lineHeight: 1.7 },

          '& .tiptap ul, & .tiptap ol': { pl: 3, my: 1 },
          '& .tiptap li': { mb: 0.5 },

          '& .tiptap blockquote': {
            borderLeft: 3,
            borderColor: 'divider',
            pl: 2,
            ml: 0,
            fontStyle: 'italic',
            color: 'text.secondary',
          },

          '& .tiptap a': {
            color: 'primary.main',
            textDecoration: 'underline',
            cursor: 'pointer',
          },

          '& .tiptap img': {
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '6px',
            my: 1,
          },

          '& .tiptap hr': {
            borderColor: 'divider',
            my: 2,
          },

          /* Inline code */
          '& .tiptap code': {
            bgcolor: 'action.hover',
            borderRadius: '4px',
            px: 0.75,
            py: 0.25,
            fontSize: '0.875em',
            fontFamily: 'monospace',
          },

          /* Code block */
          '& .tiptap pre': {
            bgcolor: 'grey.900',
            color: 'grey.100',
            borderRadius: '8px',
            p: 2,
            my: 1.5,
            overflowX: 'auto',
            fontFamily: '"Fira Code", "JetBrains Mono", monospace',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            '& code': {
              bgcolor: 'transparent',
              p: 0,
              borderRadius: 0,
              color: 'inherit',
              fontSize: 'inherit',
            },
          },

          /* Highlight */
          '& .tiptap mark': {
            bgcolor: '#fef08a',
            borderRadius: '2px',
            px: 0.25,
          },

          /* Table */
          '& .tiptap table': {
            borderCollapse: 'collapse',
            width: '100%',
            my: 1.5,
          },
          '& .tiptap th, & .tiptap td': {
            border: 1,
            borderColor: 'divider',
            px: 1.5,
            py: 1,
            textAlign: 'left',
          },
          '& .tiptap th': {
            bgcolor: 'action.hover',
            fontWeight: 600,
          },

          /* YouTube embed */
          '& .tiptap iframe': {
            borderRadius: '6px',
            my: 1,
          },

          /* Selection */
          '& .tiptap .is-editor-empty': {
            minHeight: 'inherit',
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}

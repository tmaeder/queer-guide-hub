import type { Editor } from '@tiptap/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Image,
  Table as TableIcon,
  Minus,
  Code,
  Highlighter,
  Paintbrush,
  Code2,
} from 'lucide-react';
import { Youtube } from '@/components/icons/brand';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface EditorToolbarProps {
  editor: Editor | null;
}

/* ------------------------------------------------------------------ */
/*  Toolbar button                                                     */
/* ------------------------------------------------------------------ */

interface TBProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, label, isActive, disabled, onClick }: TBProps) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-element border-0 transition-all duration-150 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:flex-shrink-0 ${
            disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'
          } ${
            isActive
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-transparent text-muted-foreground hover:bg-muted'
          }`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  Divider between toolbar sections                                   */
/* ------------------------------------------------------------------ */

function ToolbarDivider() {
  return <div className="self-stretch w-px mx-1 my-1 bg-border" />;
}

/* ------------------------------------------------------------------ */
/*  Main toolbar                                                       */
/* ------------------------------------------------------------------ */

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  /* ---- helpers ---- */

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Enter URL', previousUrl ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run();
  };

  const addImage = () => {
    const url = window.prompt('Enter image URL');
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const addYoutube = () => {
    const url = window.prompt('Enter YouTube video URL');
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
  };

  const insertTable = () => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  /* ---- render ---- */

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-background rounded-t-lg">
      {/* ── Text formatting ──────────────────────────── */}

      <ToolbarButton
        icon={<Bold />}
        label="Bold"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={<Italic />}
        label="Italic"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={<UnderlineIcon />}
        label="Underline"
        isActive={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={<Strikethrough />}
        label="Strikethrough"
        isActive={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <ToolbarDivider />

      {/* ── Headings ─────────────────────────────────── */}

      <ToolbarButton
        icon={<Heading1 />}
        label="Heading 1"
        isActive={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={<Heading2 />}
        label="Heading 2"
        isActive={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={<Heading3 />}
        label="Heading 3"
        isActive={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        icon={<Heading4 />}
        label="Heading 4"
        isActive={editor.isActive('heading', { level: 4 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
      />

      <ToolbarDivider />

      {/* ── Lists & blockquote ───────────────────────── */}

      <ToolbarButton
        icon={<List />}
        label="Bullet List"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<ListOrdered />}
        label="Ordered List"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={<Quote />}
        label="Blockquote"
        isActive={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />

      <ToolbarDivider />

      {/* ── Alignment ────────────────────────────────── */}

      <ToolbarButton
        icon={<AlignLeft />}
        label="Align Left"
        isActive={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarButton
        icon={<AlignCenter />}
        label="Align Center"
        isActive={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarButton
        icon={<AlignRight />}
        label="Align Right"
        isActive={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />

      <ToolbarDivider />

      {/* ── Insert ───────────────────────────────────── */}

      <ToolbarButton
        icon={<Link />}
        label="Insert Link"
        isActive={editor.isActive('link')}
        onClick={setLink}
      />
      <ToolbarButton
        icon={<Image />}
        label="Insert Image"
        onClick={addImage}
      />
      <ToolbarButton
        icon={<TableIcon />}
        label="Insert Table"
        onClick={insertTable}
      />
      <ToolbarButton
        icon={<Minus />}
        label="Horizontal Rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
      <ToolbarButton
        icon={<Youtube />}
        label="Embed YouTube"
        onClick={addYoutube}
      />

      <ToolbarDivider />

      {/* ── Code ─────────────────────────────────────── */}

      <ToolbarButton
        icon={<Code />}
        label="Inline Code"
        isActive={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <ToolbarButton
        icon={<Code2 />}
        label="Code Block"
        isActive={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />

      <ToolbarDivider />

      {/* ── Highlight & color ────────────────────────── */}

      <ToolbarButton
        icon={<Highlighter />}
        label="Highlight"
        isActive={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />
      <ToolbarButton
        icon={<Paintbrush />}
        label="Text Color"
        onClick={() => {
          const color = window.prompt(
            'Enter a CSS color (e.g. #ff0000, red)',
            editor.getAttributes('textStyle').color as string | undefined ?? '',
          );
          if (color === null) return;
          if (color === '') {
            editor.chain().focus().unsetColor().run();
            return;
          }
          editor.chain().focus().setColor(color).run();
        }}
      />
    </div>
  );
}

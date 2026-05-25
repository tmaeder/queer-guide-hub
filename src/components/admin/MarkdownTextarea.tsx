import { useRef, type ComponentProps } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Link, List, Heading2 } from 'lucide-react';

interface MarkdownTextareaProps extends Omit<ComponentProps<typeof Textarea>, 'onChange'> {
  value: string;
  onChange: (next: string) => void;
}

type Wrap = { before: string; after: string; placeholder?: string };

const WRAPS: Record<string, Wrap> = {
  bold: { before: '**', after: '**', placeholder: 'bold text' },
  italic: { before: '_', after: '_', placeholder: 'italic text' },
  link: { before: '[', after: '](https://)', placeholder: 'link text' },
  h2: { before: '\n## ', after: '\n', placeholder: 'Heading' },
  list: { before: '\n- ', after: '', placeholder: 'item' },
};

/**
 * Plain textarea with a thin markdown toolbar (bold / italic / link / h2 / list).
 * Operates on the selection — wraps it or inserts the placeholder when empty.
 * Lightweight alternative to Tiptap for short-form prose like guide intros.
 */
export function MarkdownTextarea({ value, onChange, ...rest }: MarkdownTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (key: keyof typeof WRAPS) => {
    const el = ref.current;
    if (!el) return;
    const { before, after, placeholder } = WRAPS[key];
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const insert = selected || placeholder || '';
    const next = value.slice(0, start) + before + insert + after + value.slice(end);
    onChange(next);
    // Restore cursor inside the inserted segment.
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + insert.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-element border border-border bg-muted/40 px-2 py-1">
        <Button type="button" variant="ghost" size="icon" onClick={() => apply('bold')} aria-label="Bold">
          <Bold size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => apply('italic')} aria-label="Italic">
          <Italic size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => apply('link')} aria-label="Link">
          <Link size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => apply('h2')} aria-label="Heading">
          <Heading2 size={14} />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => apply('list')} aria-label="List">
          <List size={14} />
        </Button>
        <span className="ml-auto text-2xs uppercase tracking-[0.15em] text-muted-foreground">
          Markdown
        </span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  );
}

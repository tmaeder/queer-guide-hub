import { useEffect, useRef, useState } from 'react';
import { RichTextEditor } from '@/components/cms/editor/RichTextEditor';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

/** Inline richtext wrapper. Stores HTML string in the DB column. */
export function RichTextInlineEditor({
  field,
  initialValue,
  onSave,
  onCancel,
  saving,
}: EditorProps) {
  const initialHtml = typeof initialValue === 'string' ? initialValue : '';
  const htmlRef = useRef<string>(initialHtml);
  // Pass HTML through `value`: Tiptap accepts an HTML string as `content`.
  const [seed] = useState<string>(initialHtml);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="block">
      <RichTextEditor
        value={seed as unknown as Record<string, unknown>}
        onChange={(_json, html) => {
          htmlRef.current = html;
        }}
        placeholder={field.placeholder ?? `Edit ${field.label}…`}
        minHeight="180px"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">Esc to cancel</span>
        <EditorActions
          onConfirm={() => onSave(htmlRef.current)}
          onCancel={onCancel}
          saving={saving}
        />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

export function TextareaEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [value, setValue] = useState(typeof initialValue === 'string' ? initialValue : '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="block">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={field.placeholder}
        disabled={saving}
        rows={4}
        aria-label={field.label}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to save · Esc to cancel</span>
        <EditorActions onConfirm={() => onSave(value)} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}

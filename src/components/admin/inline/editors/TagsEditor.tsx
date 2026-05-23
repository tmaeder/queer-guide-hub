import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

export function TagsEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [tags, setTags] = useState<string[]>(toArray(initialValue));
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) {
      setDraft('');
      return;
    }
    setTags([...tags, t]);
    setDraft('');
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (draft.trim()) {
        addTag(draft);
      } else {
        onSave(tags);
      }
    } else if (e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        addTag(draft);
      }
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault();
      setTags(tags.slice(0, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="block">
      <div className="flex flex-wrap items-center gap-2 p-2 border border-border rounded-element bg-background min-h-12">
        {tags.map((t) => (
          <Badge key={t} variant="outline" className="gap-1">
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              aria-label={`Remove ${t}`}
              className="inline-flex items-center"
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
        <Input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && addTag(draft)}
          placeholder={tags.length === 0 ? (field.placeholder ?? 'type and press Enter') : ''}
          disabled={saving}
          className="flex-1 min-w-24 border-0 shadow-none focus-visible:ring-0 h-7 p-0"
          aria-label={field.label}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">
          Enter / comma to add · Backspace to remove · Esc to cancel
        </span>
        <EditorActions onConfirm={() => onSave(tags)} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { ImageUpload } from '@/components/ui/image-upload';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

export function ImageArrayEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [items, setItems] = useState<string[]>(toArray(initialValue));
  const [adding, setAdding] = useState<string>('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
  };

  return (
    <div className="block p-4 border border-border rounded-element bg-background max-w-2xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map((src, idx) => (
          <div key={`${src}-${idx}`} className="relative aspect-square overflow-hidden rounded-element border border-border">
            <img src={src} alt="" role="presentation" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex flex-col justify-between p-1 opacity-0 hover:opacity-100 transition-opacity bg-foreground/30">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  aria-label="Remove image"
                  className="inline-flex items-center justify-center bg-background rounded-element"
                  style={{ width: 24, height: 24 }}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move left"
                  className="inline-flex items-center justify-center bg-background rounded-element disabled:opacity-30"
                  style={{ width: 24, height: 24 }}
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move right"
                  className="inline-flex items-center justify-center bg-background rounded-element disabled:opacity-30"
                  style={{ width: 24, height: 24 }}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <ImageUpload
          value={adding}
          onValueChange={(url) => {
            if (url) {
              setItems([...items, url]);
              setAdding('');
            }
          }}
          label={`Add to ${field.label}`}
        />
      </div>
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Drag-reorder coming later · Esc to cancel</span>
        <EditorActions onConfirm={() => onSave(items)} onCancel={onCancel} saving={saving} />
      </div>
    </div>
  );
}

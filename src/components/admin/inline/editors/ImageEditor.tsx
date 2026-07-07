import { useEffect, useState } from 'react';
import { ImageUpload } from '@/components/ui/image-upload';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

export function ImageEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [url, setUrl] = useState<string>(typeof initialValue === 'string' ? initialValue : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="block p-4 border border-border rounded-element bg-background max-w-md">
      <ImageUpload value={url} onValueChange={setUrl} label={field.label} />
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">Esc to cancel</span>
        <EditorActions
          onConfirm={() => onSave(url || null)}
          onCancel={onCancel}
          saving={saving}
        />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

export function BooleanEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [value, setValue] = useState<boolean>(Boolean(initialValue));
  return (
    <span className="inline-flex items-center align-middle gap-2">
      <Switch
        checked={value}
        onCheckedChange={setValue}
        disabled={saving}
        aria-label={field.label}
      />
      <span className="text-xs text-muted-foreground">{value ? 'On' : 'Off'}</span>
      <EditorActions onConfirm={() => onSave(value)} onCancel={onCancel} saving={saving} />
    </span>
  );
}

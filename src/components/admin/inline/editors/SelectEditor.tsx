import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

export function SelectEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [value, setValue] = useState<string>(initialValue == null ? '' : String(initialValue));
  const [open, setOpen] = useState(true);

  return (
    <span className="inline-flex items-center align-middle gap-1">
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value}
        onValueChange={(v) => setValue(v)}
        disabled={saving}
      >
        <SelectTrigger className="h-8 min-w-40" aria-label={field.label}>
          <SelectValue placeholder={field.placeholder ?? `Select ${field.label}…`} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <EditorActions
        onConfirm={() => onSave(value === '' ? null : value)}
        onCancel={onCancel}
        saving={saving}
      />
    </span>
  );
}

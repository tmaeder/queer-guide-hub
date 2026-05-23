import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { EditorActions } from './EditorActions';
import type { EditorProps } from './types';

export function TextEditor({ field, initialValue, onSave, onCancel, saving }: EditorProps) {
  const [value, setValue] = useState(toStr(initialValue));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const inputType =
    field.type === 'email'
      ? 'email'
      : field.type === 'phone'
        ? 'tel'
        : field.type === 'url'
          ? 'url'
          : field.type === 'number'
            ? 'number'
            : field.type === 'date'
              ? 'date'
              : field.type === 'datetime'
                ? 'datetime-local'
                : 'text';

  return (
    <span className="inline-flex items-center align-middle">
      <Input
        ref={ref}
        type={inputType}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave(coerce(field.type, value));
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={field.placeholder}
        disabled={saving}
        className="h-8 min-w-48"
        aria-label={field.label}
      />
      <EditorActions
        onConfirm={() => onSave(coerce(field.type, value))}
        onCancel={onCancel}
        saving={saving}
      />
    </span>
  );
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function coerce(type: string, raw: string): unknown {
  if (type === 'number') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

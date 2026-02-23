import React, { useCallback, useMemo, lazy, Suspense } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Rich text editor field for the 'richtext' type.
 * Lazy-loads the RichTextEditor from the CMS editor module.
 * Value can be stored as HTML string or JSON (TipTap/ProseMirror doc).
 * Falls back to a textarea if the editor is not yet available.
 */

const RichTextEditor = lazy(() =>
  import('@/components/cms/editor/RichTextEditor').then((mod) => ({
    default: mod.RichTextEditor ?? mod.default,
  }))
);

function RichTextFallback({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <textarea
      className="w-full min-h-[200px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder || 'Enter rich text content...'}
    />
  );
}

export function RichTextField({ field, value, onChange, error, disabled }: FieldProps) {
  // Normalize value to string for the editor
  const htmlValue = useMemo(() => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    // If stored as JSON (TipTap doc), try to serialize it
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return String(value);
  }, [value]);

  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <FieldWrapper field={field} error={error}>
      <Suspense
        fallback={
          <RichTextFallback
            value={htmlValue}
            onChange={handleChange}
            disabled={disabled}
            placeholder={field.placeholder}
          />
        }
      >
        <RichTextEditor
          value={htmlValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      </Suspense>
    </FieldWrapper>
  );
}

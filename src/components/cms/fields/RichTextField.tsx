import { useCallback, useMemo, lazy, Suspense } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Rich text editor field for the 'richtext' type.
 *
 * Every column bound to this field is a plain `text` column (venues.description,
 * news_articles.content, personalities.bio, …), so this field persists HTML —
 * the SECOND argument of the editor's onChange. Persisting the first argument
 * writes a ProseMirror object into a text column; that was the prior behaviour
 * and it corrupted rows across ~13 content types.
 *
 * Falls back to a textarea while the editor chunk loads.
 */

const RichTextEditor = lazy(() =>
  // Named export only. The previous `mod.RichTextEditor ?? mod.default` fallback
  // collapsed the inferred component type to `any`, which is why tsc could not
  // see the onChange/value/disabled mismatches this file used to have.
  import('@/components/cms/editor/RichTextEditor').then((mod) => ({
    default: mod.RichTextEditor,
  }))
);

/** A ProseMirror doc that was previously persisted into a text column. */
function parseCorruptedDoc(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === 'doc'
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON — genuine HTML/text content */
  }
  return null;
}

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
      className="w-full min-h-[200px] rounded-element border border-input bg-background px-4 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder || 'Enter rich text content...'}
    />
  );
}

export function RichTextField({ field, value, onChange, error, disabled }: FieldProps) {
  /**
   * What the editor is seeded with. A row corrupted by the previous wiring holds
   * a stringified ProseMirror doc; hand that back to Tiptap as a document rather
   * than rendering raw JSON as literal text, so the next save repairs the row.
   */
  const editorValue = useMemo<string | Record<string, unknown>>(() => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return value as Record<string, unknown>;
    if (typeof value !== 'string') return String(value);
    return parseCorruptedDoc(value) ?? value;
  }, [value]);

  /** Plain-string mirror for the textarea fallback, which cannot render a doc. */
  const textValue = useMemo(
    () => (typeof editorValue === 'string' ? editorValue : ''),
    [editorValue]
  );

  // The editor emits (json, html). This field is bound to text columns, so it
  // persists the HTML and deliberately discards the JSON.
  const handleEditorChange = useCallback(
    (_json: Record<string, unknown>, html: string) => {
      onChange(html);
    },
    [onChange]
  );

  const handleTextChange = useCallback((next: string) => onChange(next), [onChange]);

  return (
    <FieldWrapper field={field} error={error}>
      <Suspense
        fallback={
          <RichTextFallback
            value={textValue}
            onChange={handleTextChange}
            disabled={disabled}
            placeholder={field.placeholder}
          />
        }
      >
        <RichTextEditor
          value={editorValue}
          onChange={handleEditorChange}
          editable={!disabled}
          placeholder={field.placeholder}
        />
      </Suspense>
    </FieldWrapper>
  );
}

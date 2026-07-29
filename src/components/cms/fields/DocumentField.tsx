import { useCallback, useMemo, lazy, Suspense } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Block-editor field for a jsonb document column (`cms_pages.body_doc`).
 *
 * Distinct from RichTextField, which is bound to plain `text` columns and
 * therefore persists HTML only. This field persists BOTH representations in one
 * write: `body_doc` (the ProseMirror doc, source of truth) and `body_html` (the
 * derived, crawlable artifact every public surface still renders). It also
 * flips `body_source` to 'doc' so "which representation wins" is recorded in a
 * column rather than inferred.
 *
 * Writing all three together via `setFields` matters: a save that updated
 * body_doc without body_html would leave the public page showing stale content
 * indefinitely, because the reader path never looks at body_doc.
 */

const RichTextEditor = lazy(() =>
  import('@/components/cms/editor/RichTextEditor').then((mod) => ({
    default: mod.RichTextEditor,
  })),
);

/** Columns this field owns, beyond the one it is declared on. */
export const DOCUMENT_FIELD_HTML_COLUMN = 'body_html';
export const DOCUMENT_FIELD_SOURCE_COLUMN = 'body_source';

function isProseMirrorDoc(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'doc'
  );
}

export function DocumentField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
  allValues,
}: FieldProps) {
  /**
   * Seed order: the stored doc if there is one, otherwise the existing HTML so
   * a legacy page converts on first edit. That makes conversion an explicit
   * editorial act with a visible diff rather than a blind migration over
   * hand-authored legal copy.
   */
  const seed = useMemo<string | Record<string, unknown>>(() => {
    if (isProseMirrorDoc(value)) return value;
    const html = allValues?.[DOCUMENT_FIELD_HTML_COLUMN];
    return typeof html === 'string' ? html : '';
  }, [value, allValues]);

  const handleChange = useCallback(
    (json: Record<string, unknown>, html: string) => {
      if (setFields) {
        setFields({
          [field.name]: json,
          [DOCUMENT_FIELD_HTML_COLUMN]: html,
          [DOCUMENT_FIELD_SOURCE_COLUMN]: 'doc',
        });
        return;
      }
      // No batch setter available — persist the doc rather than silently
      // dropping the edit. body_html would then be stale, so this path is a
      // fallback, not the intended one.
      onChange(json);
    },
    [setFields, onChange, field.name],
  );

  return (
    <FieldWrapper field={field} error={error}>
      <Suspense
        fallback={
          <div className="min-h-[200px] rounded-element border border-input bg-muted" />
        }
      >
        <RichTextEditor
          value={seed}
          onChange={handleChange}
          editable={!disabled}
          placeholder={field.placeholder}
          minHeight="360px"
          enableDatabaseBlock
        />
      </Suspense>
    </FieldWrapper>
  );
}

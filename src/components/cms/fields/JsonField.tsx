import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { StructuredValueEditor } from './structured/StructuredValueEditor';
import { StructuredValueView } from './structured/StructuredValueView';

/**
 * Field for jsonb columns (`type: 'json'`).
 *
 * Renders the value as structured data — named fields, lists, text/number
 * inputs and yes/no switches — never as raw JSON text. Read-only fields get
 * a labelled read view.
 */
export function JsonField({ field, value, onChange, error, disabled }: FieldProps) {
  return (
    <FieldWrapper field={field} error={error}>
      <div
        id={field.name}
        role="group"
        aria-label={field.label}
        className="rounded-element border border-input bg-background p-4"
      >
        {disabled ? (
          <StructuredValueView value={value} />
        ) : (
          <StructuredValueEditor value={value} onChange={onChange} label={field.label} />
        )}
      </div>
    </FieldWrapper>
  );
}

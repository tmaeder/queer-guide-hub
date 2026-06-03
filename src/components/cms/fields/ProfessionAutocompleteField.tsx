import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { ProfessionAutocomplete } from '@/components/ui/profession-autocomplete';

/**
 * CMS/submission field wrapper around the existing ProfessionAutocomplete, which
 * suggests professions already used across `personalities` (canonical values) while
 * still allowing free text. Value is a plain string (the profession name).
 */
export function ProfessionAutocompleteField({ field, value, onChange, error, disabled }: FieldProps) {
  return (
    <FieldWrapper field={field} error={error}>
      <ProfessionAutocomplete
        id={field.name}
        value={String(value ?? '')}
        onValueChange={(v) => onChange(v)}
        placeholder={field.placeholder || 'Select or type a profession…'}
        required={field.required}
        disabled={disabled}
      />
    </FieldWrapper>
  );
}

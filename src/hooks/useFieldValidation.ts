/**
 * useFieldValidation — shared field-level error state for admin forms.
 *
 * Promotes the ad-hoc `validationErrors` map pattern (first used in
 * NewsSourcesManager) into one reusable hook so validation errors render inline
 * next to the offending field instead of only in a toast. Feed it a
 * ValidationResult from src/utils/contentValidation.ts.
 *
 *   const { errors, validate, clearField, fieldProps } = useFieldValidation();
 *   if (!validate(validateNewsSource(formData))) return;     // inline errors set
 *   <Input {...fieldProps('name')} onChange={() => clearField('name')} />
 *   <FormFieldError message={errors.name} />
 */
import { useCallback, useState } from 'react';
import type { ValidationResult } from '@/utils/contentValidation';

export function useFieldValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Apply a ValidationResult; returns true when valid. First error per field wins. */
  const validate = useCallback((result: ValidationResult): boolean => {
    if (result.isValid) {
      setErrors({});
      return true;
    }
    const map: Record<string, string> = {};
    for (const e of result.errors) {
      if (!map[e.field]) map[e.field] = e.message;
    }
    setErrors(map);
    return false;
  }, []);

  /** Clear one field's error (e.g. on change) without disturbing the rest. */
  const clearField = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  /** Spread onto the input to wire aria-invalid + aria-errormessage. */
  const fieldProps = useCallback(
    (field: string) => ({
      'aria-invalid': errors[field] ? true : undefined,
      'aria-errormessage': errors[field] ? `${field}-error` : undefined,
    }),
    [errors],
  );

  return { errors, validate, clearField, clearAll, fieldProps };
}

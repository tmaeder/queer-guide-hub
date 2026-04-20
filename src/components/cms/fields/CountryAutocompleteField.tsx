import { useCallback, useRef } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { CountryAutocomplete, type Country } from '@/components/ui/country-autocomplete';

/**
 * Country autocomplete field for the CMS.
 * Wraps CountryAutocomplete and auto-sets country_id FK via setFields.
 * Clears city/city_id only when the country id genuinely changes to a
 * different non-null country. Skips clearing on null (dropdown open / blur
 * reconciliation) or when the id is unchanged — fixes the "city cleared on
 * country dropdown open" bug.
 */
export function CountryAutocompleteField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
}: FieldProps) {
  const prevCountryIdRef = useRef<string | null>(null);

  const handleCountrySelect = useCallback(
    (country: Country | null) => {
      if (!setFields || !field.relatedFields) return;

      const map = field.relatedFields;
      const nextId = country?.id ?? null;
      const prevId = prevCountryIdRef.current;

      const updates: Record<string, unknown> = {};

      if (map.country_id) {
        updates[map.country_id] = nextId;
      }

      const changedToDifferentCountry = nextId !== null && nextId !== prevId;
      if (changedToDifferentCountry) {
        if (map.city) updates[map.city] = '';
        if (map.city_id) updates[map.city_id] = null;
      }

      prevCountryIdRef.current = nextId;

      if (Object.keys(updates).length > 0) {
        setFields(updates);
      }
    },
    [setFields, field.relatedFields],
  );

  return (
    <FieldWrapper field={field} error={error}>
      <CountryAutocomplete
        id={field.name}
        value={String(value ?? '')}
        onValueChange={(name) => onChange(name)}
        onCountrySelect={handleCountrySelect}
        placeholder={field.placeholder || 'Select a country...'}
        required={field.required}
        disabled={disabled}
        error={!!error}
        ariaDescribedBy={error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined}
      />
    </FieldWrapper>
  );
}

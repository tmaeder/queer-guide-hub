import React, { useCallback } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { CountryAutocomplete, type Country } from '@/components/ui/country-autocomplete';

/**
 * Country autocomplete field for the CMS.
 * Wraps CountryAutocomplete and auto-sets country_id FK via setFields.
 * When country changes, resets city and city_id since they depend on country.
 */
export function CountryAutocompleteField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
}: FieldProps) {
  const handleCountrySelect = useCallback(
    (country: Country | null) => {
      if (!setFields || !field.relatedFields) return;

      const map = field.relatedFields;
      const updates: Record<string, unknown> = {};

      if (map.country_id) {
        updates[map.country_id] = country?.id ?? null;
      }
      // Reset city fields when country changes
      if (map.city) updates[map.city] = '';
      if (map.city_id) updates[map.city_id] = null;

      setFields(updates);
    },
    [setFields, field.relatedFields],
  );

  return (
    <FieldWrapper field={field} error={error}>
      <CountryAutocomplete
        value={String(value ?? '')}
        onValueChange={(name) => onChange(name)}
        onCountrySelect={handleCountrySelect}
        placeholder={field.placeholder || 'Select a country...'}
        required={field.required}
        disabled={disabled}
      />
    </FieldWrapper>
  );
}

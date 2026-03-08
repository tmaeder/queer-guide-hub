import React, { useState, useEffect, useCallback } from 'react';
import MuiAutocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { supabase } from '@/integrations/supabase/client';

interface CityOption {
  id: string;
  name: string;
}

/**
 * City autocomplete field for the CMS.
 * Queries cities table filtered by current country_id (read from allValues).
 * Auto-sets city_id FK via setFields when a city is selected.
 */
export function CityAutocompleteField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
  allValues,
}: FieldProps) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(String(value ?? ''));

  // Read country_id from sibling form fields
  const countryIdField = field.relatedFields?.country_id;
  const currentCountryId =
    countryIdField && allValues ? String(allValues[countryIdField] ?? '') : '';

  useEffect(() => {
    setInputValue(String(value ?? ''));
  }, [value]);

  useEffect(() => {
    const fetchCities = async () => {
      setLoading(true);
      try {
        let query = supabase.from('cities').select('id, name').order('name');

        if (currentCountryId) {
          query = query.eq('country_id', currentCountryId);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) {
          console.error('Error fetching cities:', fetchError);
          return;
        }

        setCities(data || []);
      } catch (err) {
        console.error('Error fetching cities:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCities();
  }, [currentCountryId]);

  const selectedCity = cities.find((c) => c.name === value) || null;

  const handleChange = useCallback(
    (_: unknown, newValue: CityOption | null) => {
      onChange(newValue ? newValue.name : '');

      if (!setFields || !field.relatedFields) return;
      const map = field.relatedFields;
      if (map.city_id) {
        setFields({ [map.city_id]: newValue?.id ?? null });
      }
    },
    [onChange, setFields, field.relatedFields],
  );

  return (
    <FieldWrapper field={field} error={error}>
      <MuiAutocomplete
        options={cities}
        loading={loading}
        value={selectedCity}
        inputValue={inputValue}
        onInputChange={(_, newInput) => setInputValue(newInput)}
        onChange={handleChange}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        disabled={disabled}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={field.placeholder || 'Select a city...'}
            required={field.required}
            size="small"
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress color="inherit" size={20} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        sx={{ width: '100%' }}
      />
    </FieldWrapper>
  );
}

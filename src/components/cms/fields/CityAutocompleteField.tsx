import React, { useState, useEffect, useCallback } from 'react';
import MuiAutocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { api } from '@/integrations/api/client';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { toast } from 'sonner';

interface CityOption {
  id: string;
  name: string;
  country_id: string;
  country_name: string;
  isNew?: boolean;
}

const filter = createFilterOptions<CityOption>();

/**
 * City autocomplete field for the CMS.
 * Queries cities table filtered by current country_id (read from allValues).
 * Auto-sets city_id FK via setFields when a city is selected.
 * When a city is selected, also prefills country + country_id.
 * Allows creating new cities via the resolve-or-create-city edge function.
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
  const [creating, setCreating] = useState(false);
  const [inputValue, setInputValue] = useState(String(value ?? ''));
  const { resolveAddress } = useAddressResolver();

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
        let query = api
          .from('cities')
          .select('id, name, country_id, countries!inner(name)')
          .order('name');

        if (currentCountryId) {
          query = query.eq('country_id', currentCountryId);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) {
          console.error('Error fetching cities:', fetchError);
          return;
        }

        setCities(
          (data || []).map((c: Record<string, unknown>) => ({
            id: c.id as string,
            name: c.name as string,
            country_id: c.country_id as string,
            country_name: (c.countries as { name: string })?.name ?? '',
          })),
        );
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
    async (_: unknown, newValue: CityOption | string | null) => {
      if (!newValue) {
        onChange('');
        if (setFields && field.relatedFields?.city_id) {
          setFields({ [field.relatedFields.city_id]: null });
        }
        return;
      }

      // Handle "Create: ..." option
      if (typeof newValue === 'string' || newValue.isNew) {
        const cityName = typeof newValue === 'string' ? newValue : newValue.name;
        setCreating(true);
        try {
          const countryName =
            field.relatedFields?.country && allValues
              ? String(allValues[field.relatedFields.country] ?? '')
              : '';
          const result = await resolveAddress(cityName, countryName || 'Unknown');
          if (result?.city_id) {
            onChange(result.city_name || cityName);
            if (setFields && field.relatedFields) {
              const map = field.relatedFields;
              const updates: Record<string, unknown> = {};
              if (map.city_id) updates[map.city_id] = result.city_id;
              if (map.country_id && result.country_id) updates[map.country_id] = result.country_id;
              if (map.country && result.country_name) updates[map.country] = result.country_name;
              setFields(updates);
            }
            toast.success(`City created: ${result.city_name || cityName}`);
          } else {
            onChange(cityName);
            toast.error('Could not create city');
          }
        } catch (err) {
          console.error('City creation failed:', err);
          onChange(typeof newValue === 'string' ? newValue : newValue.name);
        } finally {
          setCreating(false);
        }
        return;
      }

      // Standard selection — set city name + city_id + country + country_id
      onChange(newValue.name);
      if (!setFields || !field.relatedFields) return;
      const map = field.relatedFields;
      const updates: Record<string, unknown> = {};
      if (map.city_id) updates[map.city_id] = newValue.id;
      if (map.country_id && newValue.country_id) updates[map.country_id] = newValue.country_id;
      if (map.country && newValue.country_name) updates[map.country] = newValue.country_name;
      setFields(updates);
    },
    [onChange, setFields, field.relatedFields, allValues, resolveAddress],
  );

  return (
    <FieldWrapper field={field} error={error}>
      <MuiAutocomplete
        options={cities}
        loading={loading || creating}
        value={selectedCity}
        inputValue={inputValue}
        onInputChange={(_, newInput) => setInputValue(newInput)}
        onChange={handleChange}
        getOptionLabel={(option) => {
          if (typeof option === 'string') return option;
          if (option.isNew) return option.name;
          return option.country_name ? `${option.name} (${option.country_name})` : option.name;
        }}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            {option.isNew ? (
              <span>
                Create: <strong>{option.name}</strong>
              </span>
            ) : (
              <span>
                {option.name}
                {option.country_name && (
                  <span style={{ color: '#888', marginLeft: 6, fontSize: '0.85em' }}>
                    {option.country_name}
                  </span>
                )}
              </span>
            )}
          </li>
        )}
        filterOptions={(options, params) => {
          const filtered = filter(options, params);
          const { inputValue: input } = params;
          const exists = options.some((o) => o.name.toLowerCase() === input.toLowerCase());
          if (input !== '' && !exists) {
            filtered.push({
              id: `new-${input}`,
              name: input,
              country_id: '',
              country_name: '',
              isNew: true,
            });
          }
          return filtered;
        }}
        freeSolo
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        isOptionEqualToValue={(option, val) => option.id === val.id}
        disabled={disabled || creating}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={field.placeholder || 'Search or create a city...'}
            required={field.required}
            size="small"
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading || creating ? <CircularProgress color="inherit" size={20} /> : null}
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

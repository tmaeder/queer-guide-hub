import * as React from 'react';
import { useState, useEffect } from 'react';
import MuiAutocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { api } from '@/integrations/api/client';

export interface Country {
  id: string;
  name: string;
  code: string;
  flag_emoji?: string;
}

interface CountryAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  /** Called with full country object when selected (includes id for FK linking) */
  onCountrySelect?: (country: Country | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

export function CountryAutocomplete({
  value,
  onValueChange,
  onCountrySelect,
  placeholder = 'Select a country...',
  required,
  disabled,
  id,
}: CountryAutocompleteProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');

  useEffect(() => {
    const fetchCountries = async () => {
      setLoading(true);
      try {
        const { data, error } = await api
          .from('countries')
          .select('id, name, code, flag_emoji')
          .order('name');

        if (error) {
          console.error('Error fetching countries:', error);
          return;
        }

        setCountries(data || []);
      } catch (error) {
        console.error('Error fetching countries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  const selectedCountry = countries.find((country) => country.name === value) || null;

  return (
    <MuiAutocomplete
      id={id}
      options={countries}
      loading={loading}
      value={selectedCountry}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => {
        setInputValue(newInputValue);
      }}
      disabled={disabled}
      onChange={(_, newValue) => {
        onValueChange(newValue ? newValue.name : '');
        onCountrySelect?.(newValue);
      }}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.code === val.code}
      renderOption={(props, option) => {
        const { key, ...rest } = props as any;
        return (
          <Box
            component="li"
            key={key}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            {...rest}
          >
            {option.flag_emoji && <span style={{ fontSize: '1.25rem' }}>{option.flag_emoji}</span>}
            <span>{option.name}</span>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          required={required}
          size="small"
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: selectedCountry?.flag_emoji ? (
                <span style={{ fontSize: '1.25rem', marginRight: 4 }}>
                  {selectedCountry.flag_emoji}
                </span>
              ) : undefined,
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
  );
}

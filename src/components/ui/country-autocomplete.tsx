import * as React from 'react';
import { useState, useEffect } from 'react';
import MuiAutocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { listFrom } from '@/hooks/usePageFetchers';

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
  error?: boolean;
  ariaDescribedBy?: string;
}

export function CountryAutocomplete({
  value,
  onValueChange,
  onCountrySelect,
  placeholder = 'Select a country...',
  required,
  disabled,
  id,
  error,
  ariaDescribedBy,
}: CountryAutocompleteProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');

  // Sync internal inputValue when the parent updates `value` externally
  // (e.g. address autocomplete populating country). Without this, MUI sees
  // a stale inputValue and would call onChange(null) on blur to "reset"
  // invalid input, clobbering dependent fields.
  useEffect(() => {
    if (typeof value === 'string' && value !== inputValue) {
      setInputValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const fetchCountries = async () => {
      setLoading(true);
      try {
        const data = await listFrom<Country>(
          'countries',
          'id, name, code, flag_emoji',
          { col: 'name' },
        );
        setCountries(data);
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
      onChange={(_, newValue, reason) => {
        // Ignore blur reconciliation. MUI can fire onChange(null) with
        // reason='blur' when the input doesn't match an option; that would
        // wipe dependent fields (e.g. city) without user intent.
        if (newValue === null && reason !== 'clear') return;
        onValueChange(newValue ? newValue.name : '');
        onCountrySelect?.(newValue);
      }}
      clearOnBlur={false}
      autoSelect={false}
      selectOnFocus={false}
      handleHomeEndKeys
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.code === val.code}
      renderOption={(props, option) => {
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
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
          error={error}
          slotProps={{
            input: {
              ...params.InputProps,
              'aria-invalid': error || undefined,
              'aria-describedby': ariaDescribedBy,
              startAdornment: selectedCountry?.flag_emoji ? (
                <span style={{ fontSize: '1.25rem', marginRight: 4 }}>
                  {selectedCountry.flag_emoji}
                </span>
              ) : undefined,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} aria-label="Loading" /> : null}
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

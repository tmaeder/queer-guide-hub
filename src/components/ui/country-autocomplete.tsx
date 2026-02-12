import * as React from "react";
import { useState, useEffect } from "react";
import MuiAutocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { supabase } from "@/integrations/supabase/client";

interface Country {
  name: string;
  code: string;
  flag_emoji?: string;
}

interface CountryAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export function CountryAutocomplete({
  value,
  onValueChange,
  placeholder = "Select a country...",
  required,
  id,
}: CountryAutocompleteProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");

  useEffect(() => {
    const fetchCountries = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('countries')
          .select('name, code, flag_emoji')
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

  const selectedCountry = countries.find(country => country.name === value) || null;

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
      onChange={(_, newValue) => {
        onValueChange(newValue ? newValue.name : "");
      }}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.code === val.code}
      renderOption={(props, option) => {
        const { key, ...rest } = props as any;
        return (
          <Box component="li" key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }} {...rest}>
            {option.flag_emoji && (
              <span style={{ fontSize: '1.25rem' }}>{option.flag_emoji}</span>
            )}
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
                <span style={{ fontSize: '1.25rem', marginRight: 4 }}>{selectedCountry.flag_emoji}</span>
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

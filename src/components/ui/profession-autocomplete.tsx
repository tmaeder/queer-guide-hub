import * as React from "react";
import { useState, useEffect } from "react";
import MuiAutocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import { api } from "@/integrations/api/client";

const filter = createFilterOptions<string>();

interface ProfessionAutocompleteProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export function ProfessionAutocomplete({
  value,
  onValueChange,
  placeholder = "Select or type a profession...",
  required,
  id,
}: ProfessionAutocompleteProps) {
  const [professions, setProfessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProfessions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('personalities')
          .select('profession')
          .not('profession', 'is', null)
          .neq('profession', '')
          .order('profession');

        if (error) {
          console.error('Error fetching professions:', error);
          return;
        }

        // Extract unique professions and handle comma-separated values
        const uniqueProfessions = new Set<string>();

        data?.forEach(item => {
          if (item.profession) {
            const professionList = item.profession.split(',').map((p: string) => p.trim());
            professionList.forEach((profession: string) => {
              if (profession) {
                uniqueProfessions.add(profession);
              }
            });
          }
        });

        setProfessions(Array.from(uniqueProfessions).sort());
      } catch (error) {
        console.error('Error fetching professions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfessions();
  }, []);

  return (
    <MuiAutocomplete
      id={id}
      freeSolo
      options={professions}
      loading={loading}
      value={value || null}
      onChange={(_, newValue) => {
        onValueChange(typeof newValue === 'string' ? newValue : "");
      }}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === 'input') {
          onValueChange(newInputValue);
        }
      }}
      filterOptions={(options, params) => {
        const filtered = filter(options, params);
        const { inputValue } = params;
        // Suggest creating a new value if it doesn't exist
        if (inputValue !== '' && !options.includes(inputValue)) {
          filtered.push(inputValue);
        }
        return filtered;
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

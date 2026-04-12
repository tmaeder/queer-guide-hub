import React from "react";
import MuiAutocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
}

interface VenueComboboxProps {
  venues: Venue[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Special option for custom location
const CUSTOM_OPTION: Venue = { id: "custom", name: "Custom Location", city: "", state: "" };

export function VenueCombobox({
  venues,
  value,
  onValueChange,
  placeholder = "Search venues...",
  disabled = false,
  className,
}: VenueComboboxProps) {
  const venueOptions = [CUSTOM_OPTION, ...venues];
  const selectedVenue = venueOptions.find((venue) => venue.id === value) || null;

  return (
    <MuiAutocomplete
      options={venueOptions}
      value={selectedVenue}
      disabled={disabled}
      onChange={(_, newValue) => {
        onValueChange(newValue ? newValue.id : "");
      }}
      getOptionLabel={(option) => {
        if (option.id === "custom") return "Custom Location";
        return `${option.name} - ${option.city}${option.state ? `, ${option.state}` : ""}`;
      }}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      filterOptions={(options, { inputValue }) => {
        const lowerInput = inputValue.toLowerCase();
        return options.filter((option) => {
          if (option.id === "custom") return true;
          return (
            option.name.toLowerCase().includes(lowerInput) ||
            option.city.toLowerCase().includes(lowerInput) ||
            option.state.toLowerCase().includes(lowerInput) ||
            (option.address || "").toLowerCase().includes(lowerInput)
          );
        });
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
        return (
          <Box component="li" key={key} {...rest}>
            <Box>
              <Typography variant="body2" fontWeight={500}>
                {option.id === "custom" ? "Custom Location" : option.name}
              </Typography>
              {option.id !== "custom" && (
                <Typography variant="caption" color="text.secondary">
                  {option.city}
                  {option.state && `, ${option.state}`}
                  {option.address && ` • ${option.address}`}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          size="small"
        />
      )}
      className={className}
      sx={{ width: '100%' }}
    />
  );
}

import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { stack } from '@/lib/sx';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  description?: string;
  disabled?: boolean;
}

export function SelectField({
  id, label, value, onChange, options, placeholder, description, disabled,
}: SelectFieldProps) {
  return (
    <Box sx={stack(0.5)}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder || `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && (
        <Typography variant="caption" color="text.secondary">{description}</Typography>
      )}
    </Box>
  );
}

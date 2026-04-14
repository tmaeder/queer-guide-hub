import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { stack } from '@/lib/sx';

interface FormFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
  rows?: number;
  type?: string;
  disabled?: boolean;
}

export function FormField({
  id, label, value, onChange, placeholder, description, multiline, rows = 3, type, disabled,
}: FormFieldProps) {
  return (
    <Box sx={stack(0.5)}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
      {description && (
        <Typography variant="caption" color="text.secondary">{description}</Typography>
      )}
    </Box>
  );
}

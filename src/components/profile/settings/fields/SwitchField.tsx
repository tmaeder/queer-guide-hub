import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { row } from '@/lib/sx';

interface SwitchFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SwitchField({ id, label, description, checked, onChange }: SwitchFieldProps) {
  return (
    <Box sx={{ ...row(2), justifyContent: 'space-between' }}>
      <Box>
        <Label htmlFor={id}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
        </Label>
        {description && (
          <Typography variant="caption" color="text.secondary">{description}</Typography>
        )}
      </Box>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Box>
  );
}

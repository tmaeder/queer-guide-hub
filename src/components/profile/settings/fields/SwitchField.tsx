import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface SwitchFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SwitchField({ id, label, description, checked, onChange }: SwitchFieldProps) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>
          <p className="text-sm font-medium">{label}</p>
        </Label>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { LucideIcon } from '@/components/icons';

interface SwitchFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: LucideIcon;
}

export function SwitchField({
  id,
  label,
  description,
  checked,
  onChange,
  icon: Icon,
}: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 gap-2.5">
        {Icon && <Icon size={18} aria-hidden className="mt-px shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <Label htmlFor={id}>
            <span className="text-sm font-medium">{label}</span>
          </Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

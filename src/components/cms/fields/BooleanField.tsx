import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Boolean toggle field for the 'boolean' type.
 * Uses the Shadcn Switch component (MUI Switch under the hood).
 * Renders its own inline label next to the switch.
 */
export function BooleanField({ field, value, onChange, error, disabled }: FieldProps) {
  const checked = Boolean(value);

  return (
    <FieldWrapper field={field} error={error} hideLabel>
      <div className="flex items-center gap-3 py-1">
        <Switch
          id={field.name}
          checked={checked}
          onCheckedChange={(newChecked: boolean) => onChange(newChecked)}
          disabled={disabled}
          aria-invalid={!!error}
        />
        <Label htmlFor={field.name} className="text-sm font-medium cursor-pointer select-none">
          {field.label}
          {field.required && (
            <span className="text-red-500 ml-0.5">*</span>
          )}
        </Label>
      </div>
    </FieldWrapper>
  );
}

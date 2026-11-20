import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  /** Leading mark per option value (icon or flag); shown in the list and the closed trigger. */
  icons?: Partial<Record<string, ReactNode>>;
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  description,
  disabled,
  icons,
}: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder || `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {icons?.[opt.value] ? (
                <span className="inline-flex items-center gap-2">
                  {icons[opt.value]}
                  {opt.label}
                </span>
              ) : (
                opt.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </div>
  );
}

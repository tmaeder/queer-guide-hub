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
  /** The field's own mark, shown in the trigger until a value with its own mark is chosen. */
  fieldIcon?: ReactNode;
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
  fieldIcon,
}: SelectFieldProps) {
  const showFieldIcon = !!fieldIcon && !(value && icons?.[value]);
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="justify-start [&>svg:last-child]:ms-auto">
          {/* Direct children: the trigger line-clamps every `> span`, which turns a
              wrapper into a block and stacks the icon above the text. */}
          {showFieldIcon && (
            <span className="me-2 inline-flex shrink-0 text-muted-foreground" aria-hidden="true">
              {fieldIcon}
            </span>
          )}
          <SelectValue placeholder={placeholder || 'Not set'} />
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

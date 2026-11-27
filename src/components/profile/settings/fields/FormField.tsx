import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
  /** Visually hide the label (kept for screen readers) when a heading already names the field. */
  hideLabel?: boolean;
}

export function FormField({
  id,
  label,
  value,
  onChange,
  placeholder,
  description,
  multiline,
  rows = 3,
  type,
  disabled,
  hideLabel,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>
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
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </div>
  );
}

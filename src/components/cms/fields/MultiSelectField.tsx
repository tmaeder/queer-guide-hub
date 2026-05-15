import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Multi-select field for the 'multiselect' type.
 * Value is string[]. Renders each option as a toggleable checkbox row.
 * Selected values are also shown as Badge chips above the options.
 */
export function MultiSelectField({ field, value, onChange, error, disabled }: FieldProps) {
  const selectedValues = useMemo<string[]>(() => {
    if (Array.isArray(value)) return value as string[];
    return [];
  }, [value]);

  const options = field.options ?? [];

  const toggleValue = useCallback(
    (optionValue: string) => {
      if (disabled) return;
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange(newValues);
    },
    [selectedValues, onChange, disabled]
  );

  const removeValue = useCallback(
    (optionValue: string) => {
      if (disabled) return;
      onChange(selectedValues.filter((v) => v !== optionValue));
    },
    [selectedValues, onChange, disabled]
  );

  const getLabel = (val: string): string => {
    const opt = options.find((o) => o.value === val);
    return opt ? opt.label : val;
  };

  return (
    <FieldWrapper field={field} error={error}>
      {/* Selected badges */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedValues.map((val) => (
            <Badge key={val} variant="secondary" className="gap-1">
              {getLabel(val)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeValue(val)}
                  className="ml-0.5 hover:text-destructive focus:outline-none"
                  aria-label={`Remove ${getLabel(val)}`}
                >
                  x
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Checkbox list */}
      <div className="rounded-element border border-input bg-muted/30 p-2 max-h-48 overflow-y-auto space-y-1">
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground py-1 px-1">No options available</p>
        )}
        {options.map((opt) => {
          const isChecked = selectedValues.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`
                flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm
                hover:bg-muted/60 transition-colors
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleValue(opt.value)}
                disabled={disabled}
              />
              <span className="select-none">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </FieldWrapper>
  );
}

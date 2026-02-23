import React from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Date picker field for the 'date' type.
 * Uses a native HTML input type="date" styled with Tailwind for maximum reliability.
 * Value is an ISO date string (YYYY-MM-DD).
 */
export function DateField({ field, value, onChange, error, disabled }: FieldProps) {
  // Normalize value to YYYY-MM-DD string
  const dateValue = (() => {
    if (!value) return '';
    const str = String(value);
    // If it's a full ISO datetime, extract just the date part
    if (str.includes('T')) {
      return str.split('T')[0];
    }
    // Already a date string
    return str;
  })();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue || null);
  };

  return (
    <FieldWrapper field={field} error={error}>
      <input
        id={field.name}
        type="date"
        value={dateValue}
        onChange={handleChange}
        disabled={disabled}
        aria-invalid={!!error}
        className={`
          w-full h-10 px-3 py-2 rounded-lg text-sm
          bg-muted/50 border-0
          focus:outline-none focus:ring-2 focus:ring-ring
          disabled:cursor-not-allowed disabled:opacity-50
        `}
      />
    </FieldWrapper>
  );
}

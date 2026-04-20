import React from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * DateTime picker field for the 'datetime' type.
 * Uses a native HTML input type="datetime-local" styled with Tailwind.
 * Value is an ISO datetime string.
 */
export function DateTimeField({ field, value, onChange, error, disabled }: FieldProps) {
  // Normalize value to datetime-local format (YYYY-MM-DDTHH:MM)
  const datetimeValue = (() => {
    if (!value) return '';
    const str = String(value);
    // If it's a full ISO string with Z or timezone offset, convert to local format
    if (str.includes('Z') || str.match(/[+-]\d{2}:\d{2}$/)) {
      try {
        const date = new Date(str);
        if (isNaN(date.getTime())) return '';
        // Format as YYYY-MM-DDTHH:MM for datetime-local input
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      } catch {
        return '';
      }
    }
    // Already in a compatible format, strip seconds if present
    if (str.includes('T')) {
      return str.substring(0, 16);
    }
    return str;
  })();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!newValue) {
      onChange(null);
      return;
    }
    // Convert to ISO string with timezone info
    try {
      const date = new Date(newValue);
      if (!isNaN(date.getTime())) {
        onChange(date.toISOString());
      } else {
        onChange(newValue);
      }
    } catch {
      onChange(newValue);
    }
  };

  return (
    <FieldWrapper field={field} error={error}>
      <input
        id={field.name}
        type="datetime-local"
        value={datetimeValue}
        onChange={handleChange}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined}
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

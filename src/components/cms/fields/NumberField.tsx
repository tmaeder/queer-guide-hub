import React from 'react';
import { Input } from '@/components/ui/input';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Number input field for the 'number' type.
 * Uses the Shadcn Input component with type="number".
 * Displays min/max constraints as help text when configured.
 */
export function NumberField({ field, value, onChange, error, disabled }: FieldProps) {
  const numValue = value !== null && value !== undefined && value !== '' ? Number(value) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(null);
      return;
    }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  // Build constraint hint text
  const constraints: string[] = [];
  if (field.min !== undefined) constraints.push(`Min: ${field.min}`);
  if (field.max !== undefined) constraints.push(`Max: ${field.max}`);
  const constraintText = constraints.length > 0 ? constraints.join(' | ') : undefined;

  // Combine help text with constraints
  const combinedHelp = [field.helpText, constraintText].filter(Boolean).join(' -- ');
  const fieldWithHelp = { ...field, helpText: combinedHelp || field.helpText };

  return (
    <FieldWrapper field={fieldWithHelp} error={error}>
      <Input
        id={field.name}
        type="number"
        value={numValue}
        onChange={handleChange}
        placeholder={field.placeholder}
        disabled={disabled}
        min={field.min}
        max={field.max}
        step="any"
        aria-invalid={!!error}
        aria-describedby={
          error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined
        }
      />
    </FieldWrapper>
  );
}

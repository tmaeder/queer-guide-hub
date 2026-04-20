import React from 'react';
import { Label } from '@/components/ui/label';
import type { FieldConfig } from '@/types/cms';

interface FieldWrapperProps {
  field: FieldConfig;
  error?: string;
  children: React.ReactNode;
  /** Skip label rendering (e.g. for boolean/switch which renders its own label) */
  hideLabel?: boolean;
}

/**
 * Shared wrapper for all CMS field components.
 * Renders label (with required indicator), children, help text, and error message.
 * Handles colSpan for grid layout.
 */
export function FieldWrapper({ field, error, children, hideLabel }: FieldWrapperProps) {
  const colSpanClass = field.colSpan === 2 ? 'col-span-2' : 'col-span-1';

  return (
    <div className={`${colSpanClass} flex flex-col gap-1.5`}>
      {!hideLabel && (
        <Label htmlFor={field.name} className="text-sm font-medium">
          {field.label}
          {field.required && (
            <span className="text-red-500 ml-0.5">*</span>
          )}
        </Label>
      )}

      {children}

      {field.helpText && !error && (
        <p id={`${field.name}-help`} className="text-xs text-muted-foreground">{field.helpText}</p>
      )}

      {error && (
        <p id={`${field.name}-error`} role="alert" className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

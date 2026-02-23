import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Textarea field for the 'textarea' type.
 * Uses the Shadcn Textarea component (MUI InputBase multiline under the hood).
 * Auto-grows via MUI's built-in multiline behavior.
 * Shows a character counter when maxLength is configured.
 */
export function TextAreaField({ field, value, onChange, error, disabled }: FieldProps) {
  const stringValue = (value as string) ?? '';
  const charCount = stringValue.length;

  return (
    <FieldWrapper field={field} error={error}>
      <div className="relative">
        <Textarea
          id={field.name}
          value={stringValue}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          maxLength={field.maxLength}
          minLength={field.minLength}
          rows={4}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined
          }
        />
        {field.maxLength && (
          <div
            className={`text-right text-xs mt-0.5 ${
              charCount > field.maxLength ? 'text-red-500' : 'text-muted-foreground'
            }`}
          >
            {charCount}/{field.maxLength}
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

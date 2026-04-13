import React from 'react';
import { Input } from '@/components/ui/input';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Text input field for types: text, url, email, phone.
 * Uses the Shadcn Input component (MUI InputBase under the hood).
 * Shows a character counter when maxLength is configured.
 */
export function TextField({ field, value, onChange, error, disabled }: FieldProps) {
  const stringValue = (value as string) ?? '';
  const charCount = stringValue.length;

  const inputTypeMap: Record<string, string> = {
    text: 'text',
    url: 'url',
    email: 'email',
    phone: 'tel',
  };

  const inputType = inputTypeMap[field.type] || 'text';

  const handleBlur = () => {
    if (field.type === 'url' && stringValue && !/^https?:\/\//i.test(stringValue)) {
      onChange(`https://${stringValue}`);
    }
  };

  return (
    <FieldWrapper field={field} error={error}>
      <div className="relative">
        <Input
          id={field.name}
          type={inputType}
          value={stringValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={field.placeholder}
          disabled={disabled}
          maxLength={field.maxLength}
          minLength={field.minLength}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined
          }
        />
        {field.maxLength && (
          <span
            className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${
              charCount > field.maxLength ? 'text-red-500' : 'text-muted-foreground'
            }`}
          >
            {charCount}/{field.maxLength}
          </span>
        )}
      </div>
    </FieldWrapper>
  );
}

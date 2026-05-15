import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * Single select dropdown for the 'select' type.
 * Uses a native HTML <select> element styled with Tailwind for reliability.
 * Options come from field.options.
 */
export function SelectField({ field, value, onChange, error, disabled }: FieldProps) {
  const stringValue = (value as string) ?? '';
  const options = field.options ?? [];

  return (
    <FieldWrapper field={field} error={error}>
      <select
        id={field.name}
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${field.name}-error` : field.helpText ? `${field.name}-help` : undefined}
        className={`
          w-full h-10 px-3 py-2 rounded-element text-sm
          bg-muted/50 border-0
          focus:outline-none focus:ring-2 focus:ring-ring
          disabled:cursor-not-allowed disabled:opacity-50
          appearance-none
          bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
          bg-[length:16px_16px]
          bg-[position:right_8px_center]
          bg-no-repeat
          pr-8
        `}
      >
        {!field.required && (
          <option value="">
            {field.placeholder || 'Select...'}
          </option>
        )}
        {field.required && !stringValue && (
          <option value="" disabled>
            {field.placeholder || 'Select...'}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

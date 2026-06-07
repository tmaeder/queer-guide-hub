/**
 * FormFieldError — the one canonical inline field-error element for admin
 * forms. Pairs with useFieldValidation's fieldProps (the `id` should match the
 * `aria-errormessage` it generates, i.e. `${field}-error`).
 */
interface FormFieldErrorProps {
  /** Should be `${field}-error` to match useFieldValidation's aria wiring. */
  id?: string;
  message?: string;
}

export function FormFieldError({ id, message }: FormFieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

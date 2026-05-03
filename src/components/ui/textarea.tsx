import * as React from 'react';
import InputBase from '@mui/material/InputBase';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea wrapper around MUI InputBase (multiline).
 *
 * Guards against re-entrant onChange loops when an external caller writes to
 * the underlying element via the native value setter and dispatches both
 * `input` and `change` events. Swallows a synthetic onChange whose target
 * value matches what we already relayed, breaking the feedback cycle that
 * can trigger React #185 with TextareaAutosize's layout effect. Typing,
 * paste, IME composition are unaffected (each produces a distinct value).
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, onChange, value, defaultValue, ...props }, ref) => {
    const lastSeenRef = React.useRef<string | undefined>(
      typeof value === 'string'
        ? value
        : typeof defaultValue === 'string'
          ? defaultValue
          : undefined,
    );

    React.useEffect(() => {
      if (typeof value === 'string') lastSeenRef.current = value;
    }, [value]);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = e.target.value;
        if (next === lastSeenRef.current) return;
        lastSeenRef.current = next;
        onChange?.(e);
      },
      [onChange],
    );

    return (
      <InputBase
        inputRef={ref}
        className={className}
        style={style}
        multiline
        minRows={3}
        fullWidth
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange as unknown as React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>}
        sx={{
          px: 1.5,
          py: 1,
          fontSize: '0.875rem',
          bgcolor: 'action.hover',
          borderRadius: 1.25,
          '&:focus-within': {
            bgcolor: 'action.selected',
          },
          '& textarea::placeholder': {
            color: 'text.secondary',
            opacity: 1,
          },
          '&.Mui-disabled': {
            cursor: 'not-allowed',
            opacity: 0.5,
          },
        }}
        {...(props as Record<string, unknown>)}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };

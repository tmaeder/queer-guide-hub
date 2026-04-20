import * as React from 'react';
import InputBase from '@mui/material/InputBase';

export type InputProps = React.ComponentProps<'input'>;

const ARIA_INPUT_KEYS = ['aria-label', 'aria-labelledby', 'aria-describedby', 'role'] as const;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    const rest: Record<string, unknown> = { ...(props as Record<string, unknown>) };
    const inputProps: Record<string, unknown> = {};
    for (const key of ARIA_INPUT_KEYS) {
      if (rest[key] != null) {
        inputProps[key] = rest[key];
        delete rest[key];
      }
    }
    return (
      <InputBase
        type={type}
        inputRef={ref}
        className={className}
        style={style}
        fullWidth
        size="small"
        inputProps={inputProps}
        sx={{
          height: 40,
          px: 1.5,
          py: 0.5,
          fontSize: { xs: '1rem', md: '0.875rem' },
          bgcolor: 'action.hover',
          borderRadius: 0,
          '&:focus-within': {
            bgcolor: 'action.selected',
          },
          '& input::placeholder': {
            color: 'text.secondary',
            opacity: 1,
          },
          '&.Mui-disabled': {
            cursor: 'not-allowed',
            opacity: 0.5,
          },
        }}
        {...rest}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };

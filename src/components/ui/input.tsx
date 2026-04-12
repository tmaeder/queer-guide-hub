import * as React from 'react';
import InputBase from '@mui/material/InputBase';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <InputBase
        type={type}
        inputRef={ref}
        className={className}
        style={style}
        fullWidth
        size="small"
        sx={{
          height: 40,
          px: 1.5,
          py: 0.5,
          fontSize: { xs: '1rem', md: '0.875rem' },
          bgcolor: 'action.hover',
          borderRadius: 1.25,
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
        {...(props as Record<string, unknown>)}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };

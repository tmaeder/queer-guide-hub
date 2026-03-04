import * as React from 'react';
import InputBase from '@mui/material/InputBase';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => {
    return (
      <InputBase
        inputRef={ref}
        className={className}
        style={style}
        multiline
        minRows={3}
        fullWidth
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
        {...(props as any)}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };

import { useState, useId, forwardRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface FloatingInputProps
  extends Omit<React.ComponentProps<'input'>, 'placeholder'> {
  label: string;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, className, value, defaultValue, onFocus, onBlur, ...props }, ref) => {
    const id = useId();
    const [focused, setFocused] = useState(false);
    const hasValue =
      value !== undefined ? String(value).length > 0 : !!defaultValue;
    const floated = focused || hasValue;

    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn(
            'peer flex h-14 w-full rounded-md border border-input bg-background px-3.5 pt-5 pb-1.5 text-base md:text-sm text-foreground shadow-sm',
            'transition-[border-color,box-shadow] duration-200 ease-out',
            'focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <motion.label
          htmlFor={id}
          className="absolute left-3.5 origin-left pointer-events-none text-muted-foreground font-medium"
          initial={false}
          animate={{
            y: floated ? 6 : 18,
            scale: floated ? 0.72 : 1,
            opacity: floated ? 0.7 : 0.55,
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          {label}
        </motion.label>
      </div>
    );
  },
);
FloatingInput.displayName = 'FloatingInput';

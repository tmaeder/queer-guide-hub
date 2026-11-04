import { useId, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FloatingInputProps extends Omit<React.ComponentProps<'input'>, 'placeholder'> {
  label: string;
}

/**
 * FloatingInput — Aceternity-style floating-label input, simplified
 * 2026-05-19. Pure CSS peer-placeholder-shown floating, no motion.
 */
export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, className, id: idProp, ...props }, ref) => {
    const fallbackId = useId();
    const id = idProp ?? fallbackId;
    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          placeholder=" "
          className={cn(
            'peer flex h-12 w-full rounded-element bg-surface-container-high px-4 pb-1 pt-4 text-base text-foreground shadow-soft md:text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        />
        <label
          htmlFor={id}
          className={cn(
            'absolute left-3 top-3.5 origin-left pointer-events-none text-muted-foreground transition-all',
            'peer-focus:top-1 peer-focus:scale-75 peer-focus:opacity-70',
            'peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:scale-75 peer-[:not(:placeholder-shown)]:opacity-70',
          )}
        >
          {label}
        </label>
      </div>
    );
  },
);
FloatingInput.displayName = 'FloatingInput';

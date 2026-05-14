import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Accessible name announced to screen readers. Defaults to "Loading". */
  label?: string;
  /** Pixel size of the spinner icon. Defaults to 24 (matches MUI medium). */
  size?: number;
}

/**
 * Accessible loading spinner. Replaces an earlier MUI CircularProgress wrapper.
 * Use everywhere instead of bare <Loader2 />.
 */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { label, size = 24, className, ...props },
  ref,
) {
  const { t } = useTranslation();
  const accessibleName = label ?? t('common.loading', 'Loading');
  return (
    <span
      ref={ref}
      role="progressbar"
      aria-label={accessibleName}
      className={cn('inline-flex items-center justify-center', className)}
      {...props}
    >
      <Loader2 className="animate-spin" style={{ width: size, height: size }} />
    </span>
  );
});

export default Spinner;

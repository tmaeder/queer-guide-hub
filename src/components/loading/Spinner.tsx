import * as React from 'react';
import CircularProgress, { type CircularProgressProps } from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';

export interface SpinnerProps extends Omit<CircularProgressProps, 'aria-label'> {
  /** Accessible name announced to screen readers. Defaults to "Loading". */
  label?: string;
}

/**
 * MUI CircularProgress with a guaranteed accessible name (WCAG 4.1.2,
 * axe `aria-progressbar-name`). Use everywhere instead of bare
 * `<CircularProgress />`.
 */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { label, ...props },
  ref,
) {
  const { t } = useTranslation();
  const accessibleName = label ?? t('common.loading', 'Loading');
  return <CircularProgress ref={ref} aria-label={accessibleName} role="progressbar" {...props} />;
});

export default Spinner;

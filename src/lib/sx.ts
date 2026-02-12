import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Utility helpers for MUI sx prop — eases Tailwind → MUI migration.
 * These provide common layout patterns as reusable sx objects.
 */

/** Container pattern matching Tailwind's container mx-auto px-4 */
export const container: SxProps<Theme> = {
  maxWidth: 'lg',
  mx: 'auto',
  px: { xs: 2, sm: 3, md: 4 },
};

/** Responsive helper — shorthand for MUI breakpoint object */
export function responsive<T>(xs: T, sm?: T, md?: T, lg?: T, xl?: T) {
  const result: Record<string, T> = { xs };
  if (sm !== undefined) result.sm = sm;
  if (md !== undefined) result.md = md;
  if (lg !== undefined) result.lg = lg;
  if (xl !== undefined) result.xl = xl;
  return result;
}

/** Center content vertically and horizontally */
export const center: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** Full-width page wrapper with vertical padding */
export const pageWrapper: SxProps<Theme> = {
  width: '100%',
  py: { xs: 4, md: 6 },
};

/** Stack-like pattern — flex column with gap */
export function stack(gap: number = 2): SxProps<Theme> {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap,
  };
}

/** Row pattern — flex row with gap and center alignment */
export function row(gap: number = 1, align: string = 'center'): SxProps<Theme> {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: align,
    gap,
  };
}

/**
 * Backward-compatible cn() wrapper.
 * During migration, files that still use cn() can import from here.
 * After migration, this will be removed.
 */
export { cn } from './utils';

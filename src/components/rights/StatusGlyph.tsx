import { Check, Minus, X } from 'lucide-react';
import type { StatusKind } from '@/lib/rights/rightsValue';

/**
 * Polarity as a glyph. Monochrome by design — `severe` is the only kind that
 * takes --destructive, and it is reserved for criminal exposure. Everything
 * else is carried by shape and weight, never hue.
 *
 * `none` (we hold no data) is a ghosted dash, deliberately distinct from `no`
 * (recorded as absent) — "the source says no" and "the source is silent" are
 * different facts and must not render alike.
 */
export function StatusGlyph({ kind, size = 15 }: { kind: StatusKind; size?: number }) {
  const cls = 'shrink-0';
  switch (kind) {
    case 'yes':
      return <Check size={size} className={`${cls} text-foreground`} aria-hidden="true" />;
    case 'severe':
      return <X size={size} className={`${cls} text-destructive`} aria-hidden="true" />;
    case 'no':
      return <X size={size} className={`${cls} text-muted-foreground`} aria-hidden="true" />;
    case 'partial':
      return <Minus size={size} className={`${cls} text-muted-foreground`} aria-hidden="true" />;
    default:
      return <Minus size={size} className={`${cls} text-muted-foreground/40`} aria-hidden="true" />;
  }
}

export default StatusGlyph;

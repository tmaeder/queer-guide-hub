import type { AddToTripDialogProps } from './AddToTripDialog';
import { TripAction } from './TripAction';
import { cn } from '@/lib/utils';

export interface QuietAddToTripButtonProps {
  entity: AddToTripDialogProps['entity'];
  /**
   * `overlay` (default) — absolute top-right chip that fades in on card hover.
   * `inline` — a static, always-visible icon button for action rows (search
   * results, list footers) where there's no `group` hover container.
   */
  variant?: 'overlay' | 'inline';
  /** Position relative to parent. Default: top-right absolute. */
  className?: string;
}

/**
 * Compact, labelled trip affordance for cards and result rows. The active trip
 * is the one-click path; TripAction owns auth resumption, duplicate state and
 * the fallback trip picker.
 */
export function QuietAddToTripButton({
  entity,
  variant = 'overlay',
  className,
}: QuietAddToTripButtonProps) {
  return (
    <TripAction
      intent={{ kind: 'add_entity', entity }}
      source={variant === 'overlay' ? 'entity-card' : 'entity-row'}
      variant="compact"
      stopPropagation
      className={cn(
        'bg-background/90',
        variant === 'overlay' && 'absolute right-3 top-3 max-w-[calc(100%-1.5rem)]',
        className,
      )}
    />
  );
}

import { useState, type MouseEvent } from 'react';
import { Luggage, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AddToTripDialog, type AddToTripDialogProps } from './AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { cn } from '@/lib/utils';

export interface QuietAddToTripButtonProps {
  entity: AddToTripDialogProps['entity'];
  /** Position relative to parent. Default: top-right absolute. */
  className?: string;
}

/**
 * Icon-only "add to trip" affordance for cards. Quiet by default (hidden until
 * hover/focus or always at 60% on touch). Stops event propagation so the parent
 * card link doesn't navigate. Wraps the existing AddToTripDialog.
 */
export function QuietAddToTripButton({ entity, className }: QuietAddToTripButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: status } = useEntityTripStatus(entity.type, entity.id);
  const inTrip = status?.isInTrip ?? false;
  const Icon = inTrip ? Check : Luggage;
  const label = inTrip
    ? t('trips.quietAdd.inTrip', 'In a trip')
    : t('trips.quietAdd.add', 'Add to a trip');

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        title={label}
        className={cn(
          'absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-element border bg-background/85 backdrop-blur transition-opacity duration-150',
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          // Touch: keep visible at 60% so it's reachable without hover.
          'opacity-60 sm:opacity-0',
          inTrip && 'opacity-100 sm:opacity-100',
          'hover:bg-background',
          className,
        )}
      >
        <Icon size={14} aria-hidden="true" />
      </button>
      {open ? (
        <AddToTripDialog open={open} onClose={() => setOpen(false)} entity={entity} />
      ) : null}
    </>
  );
}

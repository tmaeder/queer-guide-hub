import { Check, Luggage, Plane } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { Button } from '@/components/ui/button';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useTripCapture } from '@/hooks/useTripCapture';
import type { TripCaptureIntent } from '@/lib/trips/tripCaptureIntent';
import { cn } from '@/lib/utils';

export interface TripActionProps {
  intent: TripCaptureIntent;
  source: string;
  variant?: 'detail' | 'card' | 'compact';
  label?: string;
  className?: string;
  stopPropagation?: boolean;
}

export function TripAction({
  intent,
  source,
  variant = 'detail',
  label,
  className,
  stopPropagation = false,
}: TripActionProps) {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { capture, dialogIntent, closeDialog, isPending } = useTripCapture();
  const entity = intent.kind === 'add_entity' ? intent.entity : null;
  const { data: status, isLoading: statusLoading } = useEntityTripStatus(
    entity?.type ?? 'venue',
    entity?.id,
  );
  const inActive = !!activeTrip && !!status?.tripIds.includes(activeTrip.id);

  const actionLabel =
    label ??
    (intent.kind === 'start_destination'
      ? t('trips.capture.planDestination', 'Plan a trip to {{city}}', {
          city: intent.destination.cityName,
        })
      : intent.kind === 'open_active_trip'
        ? t('trips.contextBar.openTrip', 'Open trip')
        : inActive && activeTrip
          ? t('trips.capture.inTrip', 'In {{trip}}', { trip: activeTrip.title })
          : activeTrip
            ? t('trips.capture.addToActive', 'Add to {{trip}}', { trip: activeTrip.title })
            : t('trips.quietAdd.add', 'Add to a trip'));

  const Icon = intent.kind === 'start_destination' ? Plane : inActive ? Check : Luggage;

  return (
    <>
      <Button
        type="button"
        variant={variant === 'detail' ? 'default' : 'outline'}
        size="sm"
        disabled={isPending || (!!entity && statusLoading)}
        aria-busy={isPending || (!!entity && statusLoading)}
        aria-label={actionLabel}
        onClick={(event) => {
          if (stopPropagation) {
            event.preventDefault();
            event.stopPropagation();
          }
          void capture(intent, { source, alreadyInActiveTrip: inActive });
        }}
        className={cn(
          'inline-flex max-w-full items-center gap-1.5',
          variant === 'compact' && 'h-8 px-2 text-xs',
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{actionLabel}</span>
      </Button>

      {dialogIntent?.kind === 'add_entity' ? (
        <AddToTripDialog open onClose={closeDialog} entity={dialogIntent.entity} source={source} />
      ) : null}
      {dialogIntent?.kind === 'start_destination' ? (
        <CreateTripDialog
          open
          onClose={closeDialog}
          initialGeo={dialogIntent.destination}
          initialStart={dialogIntent.startDate}
          initialEnd={dialogIntent.endDate}
          source={source}
        />
      ) : null}
    </>
  );
}

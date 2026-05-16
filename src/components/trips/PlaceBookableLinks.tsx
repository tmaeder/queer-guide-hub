import { useEffect, useRef } from 'react';
import { Hotel, Ticket } from 'lucide-react';
import { logTripBookingClick } from '@/hooks/useBundledCheckout';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { useTripReservations } from '@/hooks/useTripReservations';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildPlaceBookableLinks,
  type BookableLink,
} from '@/lib/booking/placeLinks';

interface Props {
  tripId: string;
  tripPlaceId: string;
  category: 'venue' | 'event' | 'hotel' | 'custom';
  name: string;
  cityName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  bookingStatus?: 'intent' | 'booked' | 'completed';
}

const iconFor = (link: BookableLink) =>
  link.vertical === 'hotel' ? Hotel : Ticket;

export function PlaceBookableLinks({
  tripId,
  tripPlaceId,
  category,
  name,
  cityName,
  startDate,
  endDate,
  bookingStatus = 'intent',
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { updatePlace } = useTripMutations();
  const { data: reservations, refetch } = useTripReservations(tripId);
  const clickedRef = useRef(false);

  const links = buildPlaceBookableLinks({
    category,
    name,
    cityName,
    startDate,
    endDate,
  });

  // On window focus after an affiliate click, prompt user if no reservation appeared.
  useEffect(() => {
    function onFocus() {
      if (!clickedRef.current) return;
      void refetch().then(() => {
        const hasReservation = (reservations ?? []).some(
          (r) => r.title?.toLowerCase().includes(name.toLowerCase()),
        );
        if (!hasReservation) {
          toast({
            title: 'Did you complete the booking?',
            description: `Mark "${name}" as booked to track it.`,
          });
        }
        clickedRef.current = false;
      });
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [name, refetch, reservations, toast]);

  if (links.length === 0) return null;

  const onClick = (link: BookableLink) => {
    clickedRef.current = true;
    void logTripBookingClick({
      trip_id: tripId,
      trip_place_id: tripPlaceId,
      user_id: user?.id ?? null,
      provider: link.provider,
      vertical: link.vertical,
      destination_url: link.url,
    });
    // Only flip to intent if not already booked/completed
    if (bookingStatus !== 'booked' && bookingStatus !== 'completed') {
      void updatePlace.mutateAsync({ id: tripPlaceId, booking_status: 'intent' }).catch(() => {
        /* no-op */
      });
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {links.map((link) => {
          const Icon = iconFor(link);
          return (
            <Tooltip key={link.provider + link.vertical}>
              <TooltipTrigger asChild>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener sponsored noreferrer"
                  onClick={() => onClick(link)}
                  aria-label={link.label}
                  className="inline-flex items-center justify-center p-1 text-muted-foreground transition-colors hover:text-[hsl(var(--foreground))]"
                  style={{ opacity: 0.55 }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.55')}
                >
                  <Icon style={{ width: 13, height: 13 }} />
                </a>
              </TooltipTrigger>
              <TooltipContent>{link.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

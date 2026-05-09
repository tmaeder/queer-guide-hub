import { Hotel, Ticket } from 'lucide-react';
import { logTripBookingClick } from '@/hooks/useBundledCheckout';
import { useAuth } from '@/hooks/useAuth';
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
}: Props) {
  const { user } = useAuth();
  const links = buildPlaceBookableLinks({
    category,
    name,
    cityName,
    startDate,
    endDate,
  });

  if (links.length === 0) return null;

  const onClick = (link: BookableLink) => {
    void logTripBookingClick({
      trip_id: tripId,
      trip_place_id: tripPlaceId,
      user_id: user?.id ?? null,
      provider: link.provider,
      vertical: link.vertical,
      destination_url: link.url,
    });
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

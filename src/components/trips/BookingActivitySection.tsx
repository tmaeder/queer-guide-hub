import { ExternalLink, MousePointerClick, Hotel, Ticket, Plane, UtensilsCrossed, Link2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTripBookingClicks, type TripBookingClick } from '@/hooks/useTripBookingClicks';

interface Props {
  tripId: string;
}

const VERTICAL_ICON: Record<TripBookingClick['vertical'], typeof Hotel> = {
  hotel: Hotel,
  activity: Ticket,
  flight: Plane,
  restaurant: UtensilsCrossed,
  other: Link2,
};

const VERTICAL_LABEL: Record<TripBookingClick['vertical'], string> = {
  hotel: 'Hotels',
  activity: 'Activities',
  flight: 'Flights',
  restaurant: 'Dining',
  other: 'Other',
};

export function BookingActivitySection({ tripId }: Props) {
  const { data, isLoading } = useTripBookingClicks(tripId);

  if (isLoading || !data || data.total === 0) return null;

  const verticalEntries = (Object.entries(data.byVertical) as [TripBookingClick['vertical'], number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-8">
      <p
        className="font-bold mb-3 uppercase text-xs text-muted-foreground"
        style={{ letterSpacing: '0.04em' }}
      >
        Booking activity
      </p>

      <div className="p-4 bg-muted mb-3">
        <div className="flex items-center gap-2 mb-3">
          <MousePointerClick size={16} style={{ opacity: 0.7 }} />
          <p className="text-sm">
            <strong>{data.total}</strong> booking click{data.total === 1 ? '' : 's'} from this trip
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {verticalEntries.map(([v, count]) => {
            const Icon = VERTICAL_ICON[v];
            return (
              <div
                key={v}
                className="flex items-center gap-1 px-2 py-1 bg-background border border-border"
              >
                <Icon size={12} />
                <span className="text-xs font-semibold">{VERTICAL_LABEL[v]}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {data.recent.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground mb-1">Recent clicks</span>
          {data.recent.map((r) => {
            const Icon = VERTICAL_ICON[r.vertical];
            let host = r.destination_url;
            try {
              host = new URL(r.destination_url).host;
            } catch {
              // leave as-is
            }
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 px-2 py-1.5 bg-background border border-border"
              >
                <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                <span className="text-xs font-semibold flex-shrink-0">{r.provider}</span>
                <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                  {host}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(r.clicked_at), { addSuffix: true })}
                </span>
                <a
                  href={r.destination_url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="text-muted-foreground flex items-center"
                  aria-label="Open link"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

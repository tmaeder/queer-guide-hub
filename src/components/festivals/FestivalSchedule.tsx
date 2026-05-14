import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { formatEventTime } from '@/lib/event-time';
import type { Database } from '@/integrations/supabase/types';

type EventRow = Database['public']['Tables']['events']['Row'] & {
  venues?: { id: string; name: string } | null;
};

interface FestivalScheduleProps {
  events: EventRow[];
  timezone?: string | null;
}

function MetaChip({ icon: Icon, label }: { icon?: React.ComponentType<{ style?: React.CSSProperties }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs border border-border">
      {Icon && <Icon style={{ width: 12, height: 12 }} />}
      {label}
    </span>
  );
}

export function FestivalSchedule({ events, timezone }: FestivalScheduleProps) {
  if (events.length === 0) {
    return (
      <div className="p-8 text-center bg-background border border-border">
        <p className="text-muted-foreground">No events scheduled yet.</p>
      </div>
    );
  }

  const grouped = events.reduce<Record<string, EventRow[]>>((acc, event) => {
    const day = format(parseISO(event.start_date), 'yyyy-MM-dd');
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {});

  const sortedDays = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-6">
      {sortedDays.map((day, dayIdx) => (
        <div key={day}>
          <h6 className="text-base font-semibold mb-3 flex items-center gap-2">
            {format(parseISO(day), 'EEEE, MMMM d, yyyy')}
            <Badge variant="secondary">
              {`${grouped[day].length} event${grouped[day].length !== 1 ? 's' : ''}`}
            </Badge>
          </h6>
          <div className="flex flex-col gap-2 pl-4 border-l-[3px] border-primary">
            {grouped[day].map((event) => (
              <LocalizedLink key={event.id} to={`/events/${event.slug}`} style={{ textDecoration: 'none' }}>
                <div className="p-4 transition-colors hover:bg-muted">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{event.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <MetaChip icon={Clock} label={formatEventTime(event.start_date, event.end_date, timezone)} />
                        {event.venues?.name && <MetaChip icon={MapPin} label={event.venues.name} />}
                        {event.event_type && <MetaChip label={event.event_type} />}
                      </div>
                    </div>
                    {event.is_free && <Badge>Free</Badge>}
                  </div>
                </div>
              </LocalizedLink>
            ))}
          </div>
          {dayIdx < sortedDays.length - 1 && <hr className="mt-4 border-border" />}
        </div>
      ))}
    </div>
  );
}

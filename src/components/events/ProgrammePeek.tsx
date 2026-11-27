import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useEventProgramme } from '@/hooks/useEventProgramme';

const PEEK_LIMIT = 8;

/**
 * "9 events" on a festival's feed card, opening its programme.
 *
 * The feed shows one card per festival and hides the children (search_events /
 * useEvents filter `parent_event_id IS NULL`), so without this the card is the only
 * trace of a programme the reader cannot see. The list loads on first open only —
 * a feed page of umbrellas must not cost one RPC per card.
 *
 * A popover rather than an inline expand: the card sits in a grid, and growing one
 * card stretches its whole row.
 */
export function ProgrammePeek({
  eventId,
  slug,
  count,
}: {
  eventId: string;
  slug: string;
  count: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useEventProgramme(eventId, open);
  const children = [...(data?.children ?? [])].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* z-10: sits above the card's overlay link, like the card's other actions. */}
        <button
          type="button"
          className="relative z-10 rounded-badge text-xs font-semibold text-foreground underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {t('events.card.programmeCount', '{{count}} events', { count })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-4">
        {isLoading ? (
          <p className="text-13 text-muted-foreground">{t('common.loading', 'Loading…')}</p>
        ) : (
          <ul className="list-none space-y-2 p-0">
            {children.slice(0, PEEK_LIMIT).map((c) => (
              <li key={c.id} className="flex gap-2 text-13">
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                  {format(new Date(c.start_date), 'd MMM')}
                </span>
                <LocalizedLink to={`/events/${c.slug}`} className="min-w-0 truncate font-medium">
                  {c.title}
                </LocalizedLink>
              </li>
            ))}
          </ul>
        )}
        <LocalizedLink
          to={`/events/${slug}#programme`}
          className="mt-4 block text-13 font-semibold"
        >
          {t('events.card.fullProgramme', 'Full programme')}
        </LocalizedLink>
      </PopoverContent>
    </Popover>
  );
}

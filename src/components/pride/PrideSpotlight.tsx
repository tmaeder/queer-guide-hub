import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X, MapPin, Calendar, Star, Luggage, Map as MapIcon, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { rangesOverlap } from '@/components/trips/tripOverlap';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

interface PrideSpotlightProps {
  event: PrideCalendarEvent;
  onDismiss?: () => void;
  onOpenMap?: () => void;
}

function formatDateRange(start: string, end: string | null) {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sameDay = e && s.toDateString() === e.toDateString();
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };
  if (!e || sameDay) return s.toLocaleDateString(undefined, opts);
  return `${s.toLocaleDateString(undefined, opts)} — ${e.toLocaleDateString(undefined, opts)}`;
}

function daysFromNow(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

export function PrideSpotlight({ event, onDismiss, onOpenMap }: PrideSpotlightProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeTrip } = useActiveTrip();
  const [dialogOpen, setDialogOpen] = useState(false);

  const inTripWindow =
    !!activeTrip &&
    rangesOverlap(
      { start_date: event.start_date, end_date: event.end_date },
      { start_date: activeTrip.start_date, end_date: activeTrip.end_date },
    );

  const days = daysFromNow(event.start_date);
  const countdown =
    days > 0
      ? t('pride.spotlight.startsIn', { count: days })
      : days === 0
        ? t('pride.spotlight.today')
        : days > -7
          ? t('pride.spotlight.endedDaysAgo', { count: -days })
          : null;

  const hostCity = event.city ?? '';
  const country = event.country ?? '';

  return (
    <article
      aria-labelledby="spotlight-title"
      className="relative rounded-container border border-foreground bg-background overflow-hidden"
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('pride.spotlight.dismiss')}
          className="absolute right-3 top-3 z-10 inline-flex items-center justify-center size-8 min-h-0 min-w-0 rounded-element hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      )}

      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs2 uppercase tracking-label text-foreground/60">
          <span>{t('pride.spotlight.eyebrow')}</span>
          {event.is_featured && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-3 fill-foreground text-foreground" /> {t('pride.featured')}
              </span>
            </>
          )}
          {event.verification_status !== 'verified' && (
            <>
              <span aria-hidden>·</span>
              <span>{t('pride.estimated')}</span>
            </>
          )}
          {inTripWindow && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Luggage className="size-3" /> {t('pride.inTripWindow')}
              </span>
            </>
          )}
          {countdown && (
            <>
              <span aria-hidden>·</span>
              <span>{countdown}</span>
            </>
          )}
        </div>

        <h2 id="spotlight-title" className="text-headline lg:text-display font-medium leading-tight">
          <Link to={`/events/${event.slug}`} className="hover:underline">
            {event.title}
          </Link>
        </h2>

        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-foreground/70">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-3.5" /> {formatDateRange(event.start_date, event.end_date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {[hostCity, country].filter(Boolean).join(', ')}
          </span>
        </div>

        {event.description && (
          <p className="text-body-lg text-foreground/80 max-w-prose">{event.description}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild>
            <Link to={`/events/${event.slug}`}>
              {t('pride.spotlight.viewPride')}
              <ExternalLink className="size-3.5 ml-1.5" />
            </Link>
          </Button>
          <Button variant="outline" disabled={!user} onClick={() => setDialogOpen(true)}>
            <Luggage className="size-3.5 mr-1.5" />
            {user ? t('pride.spotlight.addToTrip') : t('pride.spotlight.signInToAdd')}
          </Button>
          {onOpenMap && (
            <Button variant="outline" onClick={onOpenMap}>
              <MapIcon className="size-3.5 mr-1.5" />
              {t('pride.spotlight.showOnMap')}
            </Button>
          )}
          {hostCity && (
            <Button variant="outline" asChild>
              <Link to={`/venues?city=${encodeURIComponent(hostCity)}`}>
                {t('pride.spotlight.venuesInCity', { city: hostCity })}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <AddToTripDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        entity={{ type: 'event', id: event.id, name: event.title }}
      />
    </article>
  );
}

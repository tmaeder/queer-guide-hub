import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Hotel, Ticket, ExternalLink, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  fetchTripDateRange,
  fetchTripPlaceCities,
  logTripBookingClick,
} from '@/hooks/useBundledCheckout';
import { useAuth } from '@/hooks/useAuth';

const GYG_PARTNER = '2PBDXWH';
const BOOKING_AID = '2381426';
const BOOKING_LABEL = 'queerguide-452012';

function bookingUrl(city: string, checkIn: string | null, checkOut: string | null): string {
  const params = new URLSearchParams({ ss: city, aid: BOOKING_AID, label: BOOKING_LABEL });
  if (checkIn) params.set('checkin', checkIn);
  if (checkOut) params.set('checkout', checkOut);
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function gygUrl(city: string, dateFrom: string | null): string {
  const params = new URLSearchParams({ q: city, partner_id: GYG_PARTNER });
  if (dateFrom) params.set('date_from', dateFrom);
  return `https://www.getyourguide.com/s/?${params.toString()}`;
}

interface Step {
  key: string;
  kind: 'hotel' | 'activity';
  cityName: string;
  title: string;
  subtitle: string;
  provider: 'booking' | 'getyourguide';
  vertical: 'hotel' | 'activity';
  url: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tripId: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}

/**
 * Step-through bundled booking helper: one card per city of the trip,
 * with hotel + activity affiliate links. Marks a step "booked" when
 * the user clicks through (affiliate tab opens and click is logged to
 * `trip_booking_clicks`). Skippable per step.
 */
export function BundledCheckoutDialog({
  open,
  onOpenChange,
  tripId,
  tripStartDate,
  tripEndDate,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [bookedKeys, setBookedKeys] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setIndex(0);
      setBookedKeys(new Set());
      // Load dates from trip if not passed
      let checkIn = tripStartDate ?? null;
      let checkOut = tripEndDate ?? null;
      if (!checkIn || !checkOut) {
        const trip = await fetchTripDateRange(tripId);
        checkIn = checkIn ?? trip?.start_date ?? null;
        checkOut = checkOut ?? trip?.end_date ?? null;
      }
      const data = await fetchTripPlaceCities(tripId);
      if (cancelled) return;
      const seen = new Map<string, string>();
      for (const row of data) {
        if (row.cities?.id && row.cities.name && !seen.has(row.cities.id)) {
          seen.set(row.cities.id, row.cities.name);
        }
      }
      const built: Step[] = [];
      for (const [cityId, cityName] of seen) {
        built.push({
          key: `hotel-${cityId}`,
          kind: 'hotel',
          cityName,
          title: t('trips.bundledCheckout.stayIn', 'Stay in {{city}}', { city: cityName }),
          subtitle: t('trips.bundledCheckout.compareHotels', 'Compare hotels for your dates'),
          provider: 'booking',
          vertical: 'hotel',
          url: bookingUrl(cityName, checkIn, checkOut),
        });
        built.push({
          key: `activity-${cityId}`,
          kind: 'activity',
          cityName,
          title: t('trips.bundledCheckout.thingsToDoIn', 'Things to do in {{city}}', { city: cityName }),
          subtitle: t('trips.bundledCheckout.toursTicketsDayTrips', 'Tours, tickets, day trips'),
          provider: 'getyourguide',
          vertical: 'activity',
          url: gygUrl(cityName, checkIn),
        });
      }
      setSteps(built);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, tripStartDate, tripEndDate, t]);

  const total = steps.length;
  const current = steps[index];
  const bookedCount = bookedKeys.size;

  const completeUrl = useMemo(() => {
    if (!current) return '';
    return current.url;
  }, [current]);

  const markBooked = () => {
    if (!current) return;
    void logTripBookingClick({
      trip_id: tripId,
      trip_place_id: null,
      user_id: user?.id ?? null,
      provider: current.provider,
      vertical: current.vertical,
      destination_url: current.url,
    });
    setBookedKeys((prev) => {
      const next = new Set(prev);
      next.add(current.key);
      return next;
    });
    advance();
  };

  const advance = () => {
    setIndex((i) => Math.min(i + 1, total));
  };

  const isDone = total > 0 && index >= total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('trips.bundledCheckout.title', 'Bundle your bookings')}</DialogTitle>
          <DialogDescription>
            {t('trips.bundledCheckout.description', 'Step through hotels and activities for each city on your trip.')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">
            <span className="text-xs text-muted-foreground">
              {t('common.loading', 'Loading…')}
            </span>
          </div>
        ) : total === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('trips.bundledCheckout.emptyHint', "Add places to your trip first — we'll generate bookable links per city.")}
            </p>
          </div>
        ) : isDone ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: '#059669' }} />
            <h6 className="text-base font-bold mb-1">
              {bookedCount > 0 ? t('trips.bundledCheckout.openedOf', '{{booked}} of {{total}} opened', { booked: bookedCount, total }) : t('trips.bundledCheckout.allSkipped', 'All steps skipped')}
            </h6>
            <span className="text-xs text-muted-foreground">
              {t('trips.bundledCheckout.revisitHint', 'You can revisit this anytime from the Budget tab.')}
            </span>
          </div>
        ) : (
          <div>
            <div className="flex gap-1 mb-4 items-center">
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  className="flex-1 h-1 transition-colors"
                  style={{
                    backgroundColor: bookedKeys.has(s.key)
                      ? 'hsl(var(--brand))'
                      : i === index
                        ? 'hsl(var(--foreground))'
                        : 'hsl(var(--muted))',
                    opacity: bookedKeys.has(s.key) || i === index ? 1 : 0.6,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground mb-3 block">
              {t('trips.bundledCheckout.stepOf', 'Step {{current}} of {{total}} · {{booked}} opened', { current: index + 1, total, booked: bookedCount })}
            </span>

            <div className="p-5 bg-muted flex items-start gap-3">
              <div
                className="shrink-0 w-10 h-10 flex items-center justify-center bg-background"
                style={{ color: 'hsl(var(--brand))' }}
              >
                {current?.kind === 'hotel' ? <Hotel size={20} /> : <Ticket size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">{current?.title}</p>
                <span className="text-xs text-muted-foreground">{current?.subtitle}</span>
                <span className="text-xs block mt-1 opacity-60">
                  {t('trips.bundledCheckout.via', 'via')} {current?.provider === 'booking' ? 'Booking.com' : 'GetYourGuide'}
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!isDone && total > 0 && (
            <>
              <Button variant="outline" onClick={advance} disabled={loading}>
                {t('common.skip', 'Skip')}
              </Button>
              <Button asChild disabled={loading}>
                <a
                  href={completeUrl}
                  target="_blank"
                  rel="noopener sponsored noreferrer"
                  onClick={markBooked}
                >
                  <ExternalLink style={{ width: 14, height: 14, marginRight: 6 }} />
                  {t('trips.bundledCheckout.openAndMarkBooked', 'Open & mark booked')}
                  <ArrowRight style={{ width: 14, height: 14, marginLeft: 6 }} />
                </a>
              </Button>
            </>
          )}
          {isDone && (
            <Button onClick={() => onOpenChange(false)}>{t('common.done', 'Done')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

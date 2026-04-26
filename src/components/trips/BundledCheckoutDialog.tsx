import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { supabase } from '@/integrations/supabase/client';
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
        const { data: trip } = await supabase
          .from('trips')
          .select('start_date, end_date')
          .eq('id', tripId)
          .maybeSingle();
        checkIn = checkIn ?? trip?.start_date ?? null;
        checkOut = checkOut ?? trip?.end_date ?? null;
      }
      const { data } = await supabase
        .from('trip_places')
        .select('city_id, cities(id, name)')
        .eq('trip_id', tripId);
      if (cancelled) return;
      const seen = new Map<string, string>();
      for (const row of (data ?? []) as { city_id: string | null; cities: { id: string; name: string } | null }[]) {
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
    // Fire-and-forget click log
    void supabase.from('trip_booking_clicks').insert({
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
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.loading', 'Loading…')}
            </Typography>
          </Box>
        ) : total === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('trips.bundledCheckout.emptyHint', "Add places to your trip first — we'll generate bookable links per city.")}
            </Typography>
          </Box>
        ) : isDone ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <CheckCircle2 size={40} style={{ color: '#059669', margin: '0 auto 12px' }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              {bookedCount > 0 ? t('trips.bundledCheckout.openedOf', '{{booked}} of {{total}} opened', { booked: bookedCount, total }) : t('trips.bundledCheckout.allSkipped', 'All steps skipped')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('trips.bundledCheckout.revisitHint', 'You can revisit this anytime from the Budget tab.')}
            </Typography>
          </Box>
        ) : (
          <Box>
            {/* Progress dots */}
            <Box sx={{ display: 'flex', gap: 0.5, mb: 2, alignItems: 'center' }}>
              {steps.map((s, i) => (
                <Box
                  key={s.key}
                  sx={{
                    flex: 1,
                    height: 4,
                    bgcolor: bookedKeys.has(s.key)
                      ? 'brand.main'
                      : i === index
                        ? 'text.primary'
                        : 'action.hover',
                    opacity: bookedKeys.has(s.key) || i === index ? 1 : 0.6,
                    transition: 'background-color 0.2s',
                  }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              {t('trips.bundledCheckout.stepOf', 'Step {{current}} of {{total}} · {{booked}} opened', { current: index + 1, total, booked: bookedCount })}
            </Typography>

            {/* Current card */}
            <Box sx={{ p: 2.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box
                sx={{
                  flexShrink: 0,
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.paper',
                  color: 'brand.main',
                }}
              >
                {current?.kind === 'hotel' ? <Hotel size={20} /> : <Ticket size={20} />}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {current?.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {current?.subtitle}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.6 }}>
                  {t('trips.bundledCheckout.via', 'via')} {current?.provider === 'booking' ? 'Booking.com' : 'GetYourGuide'}
                </Typography>
              </Box>
            </Box>
          </Box>
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

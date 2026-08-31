import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Clock, ArrowRight } from 'lucide-react';
import { addMonths, startOfDay, addDays, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { useTripTemplates, type TripTemplate } from '@/hooks/useTripTemplates';
import { useTranslation } from 'react-i18next';

export function TripTemplates() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { createTrip, addPlacesBulk } = useTripMutations();
  const { toast } = useToast();
  const { data: templates, isLoading } = useTripTemplates();

  const handleUseTemplate = (template: TripTemplate) => {
    // Rendered on public pages (/travel) — createTrip would RLS-fail for anon.
    if (!user) {
      navigate('/auth?redirect=/travel');
      return;
    }
    const startDate = startOfDay(addMonths(new Date(), 1));
    const endDate = addDays(startDate, template.days - 1);

    // `trips.primary_city_id` and `primary_country_id` are NOT NULL. This call
    // site sent neither until 2026-08, so every click raised 23502 and this
    // button had never once worked. The unit test below mocks `createTrip`,
    // which is why nothing caught it — the fix therefore also has to be visible
    // in the types, not just here: `TripTemplate` now carries both, and a
    // template that cannot resolve them is dropped in useTripTemplates rather
    // than rendered as an affordance that cannot function.
    createTrip.mutate(
      {
        title: template.title,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        currency: template.currency,
        cover_image_url: template.coverImageUrl ?? undefined,
        primary_city_id: template.primaryCityId,
        primary_country_id: template.primaryCountryId,
      },
      {
        onSuccess: async (trip) => {
          if (template.cityIds.length) {
            try {
              // addPlacesBulk, not the raw insertRows this used to call: the
              // mutation adds trip_id/created_by, invalidates the trip detail
              // and list caches, and emits the per-place telemetry. The raw
              // insert did none of that, so a seeded trip opened empty until
              // something else happened to refetch it.
              await addPlacesBulk.mutateAsync({
                tripId: trip.id,
                rows: template.cityIds.map((cityId, idx) => ({
                  day_id: null,
                  venue_id: null,
                  event_id: null,
                  hotel_id: null,
                  custom_name: null,
                  custom_address: null,
                  latitude: null,
                  longitude: null,
                  city_id: cityId,
                  country_id: template.primaryCountryId,
                  start_time: null,
                  end_time: null,
                  duration_minutes: null,
                  notes: null,
                  category: 'city',
                  sort_order: idx,
                  icon: null,
                  arrive_mode: null,
                })),
              });
            } catch (err) {
              console.warn('[TripTemplates] trip_places seed failed', err);
            }
          }
          toast({
            title: t('trips.templates.created', 'Trip created'),
            description: t('trips.templates.createdDescription', 'Add your stops from here.'),
          });
          navigate(`/trips/${trip.id}`);
        },
        onError: (err) => {
          toast({
            title: t('trips.templates.error', 'Could not create the trip'),
            description: err.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <div className="mt-12">
      <ScrollReveal direction="up">
        <div className="mb-6">
          {/* h3, not h5: every call site sits under an h2 (the page's section
              heading, "More inspiration", or EmptyState's title), and the two
              skipped levels failed Lighthouse `heading-order` on /trips/discover. */}
          <h3 className="font-bold text-title">
            {t('trips.templates.heading', 'Start from a template')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('trips.templates.subheading', 'LGBTQ+ itineraries to build on')}
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {isLoading && !templates
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                className="rounded-container"
                style={{ height: 220 }}
              />
            ))
          : (templates ?? []).map((template) => (
              <ScrollReveal key={template.id} direction="up">
                <Card
                  hoverable
                  onClick={() => handleUseTemplate(template)}
                  style={{ overflow: 'hidden' }}
                >
                  {/* Photo + a black readability scrim, or paper. The chromatic
                      gradient this used to fall back to went with SEASONAL_POOL:
                      a card is paper and a photo, and white type needs a scrim
                      to sit on, not a colour. */}
                  <div
                    className={
                      template.coverImageUrl
                        ? 'relative flex flex-col justify-between p-6'
                        : 'relative flex flex-col justify-between p-6 bg-muted'
                    }
                    style={{
                      backgroundImage: template.coverImageUrl
                        ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url("${template.coverImageUrl}")`
                        : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      minHeight: 140,
                    }}
                  >
                    {/* White type belongs on the scrim, never on paper. When
                        there is no photo the card is a muted surface and the
                        type is ink — the previous unconditional `text-white`
                        was invisible the moment a cover failed to resolve. */}
                    <div>
                      <p
                        className={
                          template.coverImageUrl
                            ? 'font-bold text-white mb-1'
                            : 'font-bold text-foreground mb-1'
                        }
                        style={{
                          lineHeight: 1.3,
                          textShadow: template.coverImageUrl ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                        }}
                      >
                        {template.title}
                      </p>
                      <p
                        className={
                          template.coverImageUrl
                            ? 'text-sm text-white/85'
                            : 'text-sm text-muted-foreground'
                        }
                      >
                        {template.cities}
                      </p>
                      {/* Measured, or absent. Never a claim we cannot check. */}
                      {template.reason && (
                        <p
                          className={
                            template.coverImageUrl
                              ? 'text-xs text-white/75 mt-1'
                              : 'text-xs text-muted-foreground mt-1'
                          }
                        >
                          {template.reason}
                        </p>
                      )}
                    </div>
                    <div className="mt-4">
                      <Badge variant="secondary">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {t('trips.templates.days', '{{count}} days', { count: template.days })}
                        </span>
                      </Badge>
                    </div>
                  </div>

                  <CardContent>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseTemplate(template);
                      }}
                      disabled={createTrip.isPending}
                    >
                      {t('trips.templates.use', 'Use template')}
                      <ArrowRight size={16} />
                    </Button>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
      </div>
    </div>
  );
}

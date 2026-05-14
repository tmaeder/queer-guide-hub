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
import { insertRows } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';
import { useTripTemplates, type TripTemplate } from '@/hooks/useTripTemplates';

export function TripTemplates() {
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { createTrip } = useTripMutations();
  const { toast } = useToast();
  const { data: templates, isLoading } = useTripTemplates();

  const handleUseTemplate = (template: TripTemplate) => {
    const startDate = startOfDay(addMonths(new Date(), 1));
    const endDate = addDays(startDate, template.days - 1);

    createTrip.mutate(
      {
        title: template.title,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        currency: template.currency,
      },
      {
        onSuccess: async (trip) => {
          if (template.cityIds.length && user) {
            const rows = template.cityIds.map((cityId, idx) => ({
              trip_id: trip.id,
              city_id: cityId,
              sort_order: idx,
              created_by: user.id,
            }));
            const { error } = await insertRows('trip_places', rows);
            if (error) {
              console.warn('[TripTemplates] trip_places seed failed', error);
            }
          }
          toast({ title: 'Trip created!', description: 'Start adding destinations.' });
          navigate(`/trips/${trip.id}`);
        },
        onError: (err) => {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="mt-12">
      <ScrollReveal direction="up">
        <div className="mb-6">
          <h5 className="font-bold text-2xl">
            Trip Templates
          </h5>
          <p className="text-sm text-muted-foreground mt-1">
            Get inspired with curated LGBTQ+ travel itineraries
          </p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {isLoading && !templates
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                style={{ height: 220, borderRadius: 0 }}
              />
            ))
          : (templates ?? []).map((template) => (
              <ScrollReveal key={template.id} direction="up">
                <Card
                  hoverable
                  onClick={() => handleUseTemplate(template)}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    className="relative flex flex-col justify-between"
                    style={{
                      backgroundImage: template.coverImageUrl
                        ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url("${template.coverImageUrl}"), ${template.gradient}`
                        : template.gradient,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      paddingLeft: 24,
                      paddingRight: 24,
                      paddingTop: 24,
                      paddingBottom: 20,
                      minHeight: 140,
                    }}
                  >
                    <div>
                      <p
                        className="font-bold text-white mb-1"
                        style={{
                          lineHeight: 1.3,
                          textShadow: template.coverImageUrl
                            ? '0 1px 2px rgba(0,0,0,0.5)'
                            : 'none',
                        }}
                      >
                        {template.title}
                      </p>
                      <p className="text-sm text-white/85">
                        {template.cities}
                      </p>
                    </div>
                    <div className="mt-3">
                      <Badge variant="secondary">
                        <span className="inline-flex items-center gap-1">
                          <Clock style={{ width: 12, height: 12 }} />
                          {template.days} days
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
                      Use Template
                      <ArrowRight style={{ width: 16, height: 16 }} />
                    </Button>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
      </div>
    </div>
  );
}

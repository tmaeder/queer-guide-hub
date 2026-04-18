import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Clock, ArrowRight } from 'lucide-react';
import { addMonths, startOfDay, addDays, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { supabase } from '@/integrations/supabase/client';
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
          // Best-effort pre-population with the template's cities so the
          // newly created trip already has anchor places on the map.
          if (template.cityIds.length && user) {
            const rows = template.cityIds.map((cityId, idx) => ({
              trip_id: trip.id,
              city_id: cityId,
              sort_order: idx,
              created_by: user.id,
            }));
            const { error } = await supabase.from('trip_places').insert(rows);
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
    <Box sx={{ mt: 6 }}>
      <ScrollReveal direction="up">
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Trip Templates
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Get inspired with curated LGBTQ+ travel itineraries
          </Typography>
        </Box>
      </ScrollReveal>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
          },
          gap: 2.5,
        }}
      >
        {isLoading && !templates
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                sx={{ height: 220, borderRadius: 0 }}
              />
            ))
          : (templates ?? []).map((template) => (
              <ScrollReveal key={template.id} direction="up">
                <Card
                  hoverable
                  onClick={() => handleUseTemplate(template)}
                  style={{ overflow: 'hidden' }}
                >
                  <Box
                    sx={{
                      // Dark overlay over photo for text legibility, photo
                      // over gradient fallback for missing/failed loads.
                      backgroundImage: template.coverImageUrl
                        ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url("${template.coverImageUrl}"), ${template.gradient}`
                        : template.gradient,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      px: 3,
                      pt: 3,
                      pb: 2.5,
                      position: 'relative',
                      minHeight: 140,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 700,
                          color: 'common.white',
                          lineHeight: 1.3,
                          mb: 0.5,
                          textShadow: template.coverImageUrl
                            ? '0 1px 2px rgba(0,0,0,0.5)'
                            : 'none',
                        }}
                      >
                        {template.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: 'rgba(255,255,255,0.85)' }}
                      >
                        {template.cities}
                      </Typography>
                    </Box>
                    <Box sx={{ mt: 1.5 }}>
                      <Badge variant="secondary">
                        <Box
                          component="span"
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                        >
                          <Clock style={{ width: 12, height: 12 }} />
                          {template.days} days
                        </Box>
                      </Badge>
                    </Box>
                  </Box>

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
      </Box>
    </Box>
  );
}

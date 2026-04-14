import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Clock, ArrowRight } from 'lucide-react';
import { addMonths, startOfDay, addDays, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';

interface TripTemplate {
  title: string;
  cities: string;
  days: number;
  currency: string;
  gradient: string;
}

const templates: TripTemplate[] = [
  {
    title: 'Pride Week Berlin',
    cities: 'Berlin',
    days: 7,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)',
  },
  {
    title: 'Amsterdam & Cologne Pride Circuit',
    cities: 'Amsterdam, Cologne',
    days: 5,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
  },
  {
    title: 'Barcelona Beach & Nightlife',
    cities: 'Barcelona',
    days: 4,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
  },
  {
    title: 'Bangkok & Phuket LGBTQ+ Explorer',
    cities: 'Bangkok, Phuket',
    days: 10,
    currency: 'THB',
    gradient: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
  },
  {
    title: 'NYC Pride & Beyond',
    cities: 'New York City',
    days: 5,
    currency: 'USD',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)',
  },
];

export function TripTemplates() {
  const navigate = useLocalizedNavigate();
  const { createTrip } = useTripMutations();
  const { toast } = useToast();
  const _theme = useTheme();

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
        onSuccess: (trip) => {
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
        {templates.map((template) => (
          <ScrollReveal key={template.title} direction="up">
            <Card
              hoverable
              onClick={() => handleUseTemplate(template)}
              style={{ overflow: 'hidden' }}
            >
              <Box
                sx={{
                  background: template.gradient,
                  px: 3,
                  pt: 3,
                  pb: 2.5,
                  position: 'relative',
                  minHeight: 120,
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
                    }}
                  >
                    {template.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: 'rgba(255,255,255,0.8)' }}
                  >
                    {template.cities}
                  </Typography>
                </Box>
                <Box sx={{ mt: 1.5 }}>
                  <Badge
                    variant="secondary"
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.2)',
                      color: 'common.white',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
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

              <CardContent sx={{ pt: 2 }}>
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

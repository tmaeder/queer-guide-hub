import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Calendar, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';

interface FlightCalendarWidgetProps {
  destinationIata: string;
  destinationCity: string;
  type?: 'calendar' | 'monthly';
}

interface CalendarPrice { date: string; price: number; airline: string; transfers: number }
interface MonthlyPrice { month: string; date: string; price: number; airline: string }

export function FlightCalendarWidget({ destinationIata, destinationCity, type = 'monthly' }: FlightCalendarWidgetProps) {
  const { originIata } = useVisitorOrigin();

  const { data, isLoading } = useQuery({
    queryKey: ['flight-calendar', originIata, destinationIata, type],
    queryFn: async () => {
      if (!originIata) return null;
      const { data: result, error } = await supabase.functions.invoke('flight-calendar', {
        body: { origin: originIata, destination: destinationIata, type, currency: 'eur' },
      });
      if (error) return null;
      return result?.data;
    },
    enabled: !!originIata && !!destinationIata,
    staleTime: 60 * 60 * 1000,
  });

  if (!originIata || isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={24} />
        <Skeleton variant="rounded" height={60} sx={{ mt: 1 }} />
      </Box>
    );
  }

  if (!data) return null;

  if (type === 'monthly') {
    const months = (data.months || []) as MonthlyPrice[];
    if (months.length === 0) return null;

    const cheapest = months.reduce((min, m) => m.price < min.price ? m : min, months[0]);

    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Calendar style={{ height: 18, width: 18, color: 'var(--primary)' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
            Best Time to Fly to {destinationCity}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
          {months.slice(0, 12).map((m) => {
            const isCheapest = m.date === cheapest.date;
            return (
              <Box
                key={m.date}
                sx={{
                  minWidth: 72,
                  p: 1,
                  textAlign: 'center',
                  bgcolor: isCheapest ? 'primary.main' : 'action.hover',
                  color: isCheapest ? 'primary.contrastText' : 'text.primary',
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 500, opacity: 0.8 }}>{m.month}</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
                  €{Math.round(m.price)}
                </Typography>
                {isCheapest && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3, mt: 0.3 }}>
                    <TrendingDown style={{ height: 10, width: 10 }} />
                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 600 }}>Cheapest</Typography>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // Calendar view (daily prices)
  const prices = (data.prices || []) as CalendarPrice[];
  if (prices.length === 0) return null;

  const cheapest = prices.reduce((min, p) => p.price < min.price ? p : min, prices[0]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Calendar style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Cheapest Days to Fly
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 1 }}>
        {prices.slice(0, 14).map((p) => {
          const d = new Date(p.date);
          const isCheapest = p.date === cheapest.date;
          return (
            <Box
              key={p.date}
              sx={{
                minWidth: 56,
                p: 0.75,
                textAlign: 'center',
                bgcolor: isCheapest ? 'primary.main' : 'action.hover',
                color: isCheapest ? 'primary.contrastText' : 'text.primary',
                borderRadius: 1,
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontSize: '0.55rem', opacity: 0.7 }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>€{Math.round(p.price)}</Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

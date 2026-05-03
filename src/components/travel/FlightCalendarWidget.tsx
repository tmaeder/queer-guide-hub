import { useQuery } from '@tanstack/react-query';
import { Calendar, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div>
        <Skeleton variant="text" width={200} height={24} />
        <Skeleton variant="rounded" height={60} className="mt-2" />
      </div>
    );
  }

  if (!data) return null;

  if (type === 'monthly') {
    const months = (data.months || []) as MonthlyPrice[];
    if (months.length === 0) return null;

    const cheapest = months.reduce((min, m) => m.price < min.price ? m : min, months[0]);

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar style={{ height: 18, width: 18, color: 'var(--primary)' }} />
          <span className="font-semibold" style={{ fontSize: '0.95rem' }}>
            Best Time to Fly to {destinationCity}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {months.slice(0, 12).map((m) => {
            const isCheapest = m.date === cheapest.date;
            return (
              <div
                key={m.date}
                className={`text-center rounded flex-shrink-0 ${
                  isCheapest ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'
                }`}
                style={{ minWidth: 72, padding: 8 }}
              >
                <div style={{ fontSize: '0.65rem', fontWeight: 500, opacity: 0.8 }}>{m.month}</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                  €{Math.round(m.price)}
                </div>
                {isCheapest && (
                  <div className="flex items-center justify-center" style={{ gap: 2, marginTop: 2 }}>
                    <TrendingDown style={{ height: 10, width: 10 }} />
                    <span style={{ fontSize: '0.55rem', fontWeight: 600 }}>Cheapest</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Calendar view (daily prices)
  const prices = (data.prices || []) as CalendarPrice[];
  if (prices.length === 0) return null;

  const cheapest = prices.reduce((min, p) => p.price < min.price ? p : min, prices[0]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Calendar style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <span className="font-semibold" style={{ fontSize: '0.95rem' }}>
          Cheapest Days to Fly
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-2">
        {prices.slice(0, 14).map((p) => {
          const d = new Date(p.date);
          const isCheapest = p.date === cheapest.date;
          return (
            <div
              key={p.date}
              className={`text-center rounded flex-shrink-0 ${
                isCheapest ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground'
              }`}
              style={{ minWidth: 56, padding: 6 }}
            >
              <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div style={{ fontSize: '0.65rem' }}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>€{Math.round(p.price)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

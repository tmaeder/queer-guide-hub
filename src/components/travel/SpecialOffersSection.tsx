import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';

interface SpecialOffer {
  origin: string;
  destination: string;
  price: number;
  departDate: string;
  returnDate: string;
  airline: string;
  transfers: number;
}

const MARKER = '452012';

export function SpecialOffersSection() {
  const { originIata } = useVisitorOrigin();

  const { data: offers, isLoading } = useQuery({
    queryKey: ['special-offers', originIata],
    queryFn: async (): Promise<SpecialOffer[]> => {
      // Use the v2 latest prices endpoint for recent deals
      const { data, error } = await supabase.functions.invoke('travel-deals', {
        body: {
          origin: originIata,
          type: 'popular_routes',
          currency: 'eur',
          limit: 6,
        },
      });

      if (error || !data?.deals) return [];

      // Filter for deals with significant savings (price < average)
      const deals = data.deals as Record<string, unknown>[];
      if (deals.length < 2) return [];

      const avgPrice = deals.reduce((s, d) => s + (d.price as number), 0) / deals.length;
      return deals
        .filter((d) => (d.price as number) < avgPrice * 0.8) // 20%+ below average
        .slice(0, 4)
        .map((d) => ({
          origin: d.origin as string,
          destination: d.destination as string,
          price: d.price as number,
          departDate: d.departure_date as string,
          returnDate: d.return_date as string,
          airline: d.airline as string,
          transfers: (d.stops as number) || 0,
        }));
    },
    enabled: !!originIata,
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="mb-8">
        <Skeleton className="h-6 w-[180px] mb-2" />
        <div className="flex gap-3 overflow-x-auto">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="w-[200px] h-[100px] rounded shrink-0" />)}
        </div>
      </div>
    );
  }

  if (!offers || offers.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <p className="font-bold text-base">Hot Deals</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {offers.map((offer, i) => (
          <Card key={`${offer.origin}-${offer.destination}-${i}`} className="hover:shadow-sm transition-shadow" style={{ minWidth: 200, flexShrink: 0 }}>
            <CardContent style={{ padding: 12 }}>
              <div className="flex items-center gap-1 mb-1">
                {offer.airline && (
                  <img
                    src={`https://pics.avs.io/24/24/${offer.airline}.png`}
                    alt={offer.airline}
                    role="presentation"
                    className="w-4 h-4 rounded-full"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <p className="font-bold text-[0.85rem]">
                  {offer.origin} → {offer.destination}
                </p>
              </div>
              {offer.departDate && (
                <p className="text-[0.7rem] text-muted-foreground mb-1">
                  {new Date(offer.departDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {offer.returnDate && ` - ${new Date(offer.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </p>
              )}
              <div className="flex justify-between items-center mt-2">
                <p className="font-extrabold text-[1.1rem] text-primary">
                  €{Math.round(offer.price)}
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    const url = `https://www.aviasales.com/?params=${offer.origin}${offer.destination}1&marker=${MARKER}`;
                    window.open(url, '_blank', 'noopener');
                  }}
                >
                  <ExternalLink style={{ height: 12, width: 12 }} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

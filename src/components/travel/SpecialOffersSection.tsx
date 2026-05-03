import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
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
      <Box sx={{ mb: 4 }}>
        <Skeleton variant="text" width={180} height={24} sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto' }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" width={200} height={100} />)}
        </Box>
      </Box>
    );
  }

  if (!offers || offers.length === 0) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Sparkles style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Hot Deals</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
        {offers.map((offer, i) => (
          <Card key={`${offer.origin}-${offer.destination}-${i}`} className="hover:shadow-sm transition-shadow" style={{ minWidth: 200, flexShrink: 0 }}>
            <CardContent style={{ padding: 12 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                {offer.airline && (
                  <Box
                    component="img"
                    src={`https://pics.avs.io/24/24/${offer.airline}.png`}
                    alt={offer.airline}
                    sx={{ width: 16, height: 16, borderRadius: '50%' }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                  {offer.origin} → {offer.destination}
                </Typography>
              </Box>
              {offer.departDate && (
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>
                  {new Date(offer.departDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {offer.returnDate && ` - ${new Date(offer.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </Typography>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: 'primary.main' }}>
                  €{Math.round(offer.price)}
                </Typography>
                <Button
                  size="sm"
                  onClick={() => {
                    const url = `https://www.aviasales.com/?params=${offer.origin}${offer.destination}1&marker=${MARKER}`;
                    window.open(url, '_blank', 'noopener');
                  }}
                >
                  <ExternalLink style={{ height: 12, width: 12 }} />
                </Button>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

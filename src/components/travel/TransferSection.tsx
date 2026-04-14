import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Bus, Shield, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const MARKER = '452012';

interface TransferSectionProps {
  city: string;
  equalityScore?: number | null;
  airportCode?: string | null;
  compact?: boolean;
}

function buildKiwitaxiUrl(city: string): string {
  return `https://kiwitaxi.com/search?location=${encodeURIComponent(city)}&partner_id=${MARKER}`;
}

function buildGetTransferUrl(city: string): string {
  return `https://www.gettransfer.com/en?utm_source=travelpayouts&utm_medium=affiliate&location=${encodeURIComponent(city)}`;
}

export function TransferSection({ city, equalityScore, airportCode, compact = false }: TransferSectionProps) {
  const isLowSafety = equalityScore != null && equalityScore < 50;
  const kiwitaxiUrl = buildKiwitaxiUrl(city);
  const getTransferUrl = buildGetTransferUrl(city);

  if (compact) {
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, p: 2, borderRadius: 1,
        bgcolor: isLowSafety ? 'warning.light' : 'action.hover',
      }}>
        <Bus style={{ height: 20, width: 20, color: isLowSafety ? 'var(--warning)' : 'var(--primary)', flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
            {isLowSafety ? 'Private Transfer Recommended' : `Airport Transfer in ${city}`}
          </Typography>
          {isLowSafety && (
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              Private transfers are safer in destinations with lower equality scores
            </Typography>
          )}
        </Box>
        <Button size="sm" onClick={() => window.open(kiwitaxiUrl, '_blank', 'noopener')}>
          Book
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Bus style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Airport Transfers{airportCode ? ` (${airportCode})` : ''}
        </Typography>
        {isLowSafety && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
            <Shield style={{ height: 14, width: 14, color: 'var(--warning)' }} />
            <Typography sx={{ fontSize: '0.7rem', color: 'warning.main', fontWeight: 600 }}>Recommended</Typography>
          </Box>
        )}
      </Box>

      {isLowSafety && (
        <Box sx={{ bgcolor: 'warning.light', p: 1.5, borderRadius: 1, mb: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem' }}>
            This destination has a lower LGBTQ+ safety score. We recommend booking a private transfer for a safer, more comfortable arrival.
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>Kiwitaxi</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
              Pre-booked airport pickup, fixed price, meet & greet
            </Typography>
            <Button size="sm" className="w-full" onClick={() => window.open(kiwitaxiUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Book Transfer
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>GetTransfer</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }}>
              Private drivers, any route, competitive bidding
            </Typography>
            <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(getTransferUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Get Quotes
            </Button>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

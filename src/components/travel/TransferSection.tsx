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
      <div
        className="flex items-center gap-3 p-4"
        style={{ backgroundColor: isLowSafety ? 'hsl(var(--warning) / 0.15)' : 'hsl(var(--muted))' }}
      >
        <Bus style={{ height: 20, width: 20, color: isLowSafety ? 'var(--warning)' : 'var(--primary)', flexShrink: 0 }} />
        <div className="flex-1">
          <p className="font-semibold text-sm">
            {isLowSafety ? 'Private Transfer Recommended' : `Airport Transfer in ${city}`}
          </p>
          {isLowSafety && (
            <p className="text-xs text-muted-foreground">
              Private transfers are safer in destinations with lower equality scores
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => window.open(kiwitaxiUrl, '_blank', 'noopener')}>
          Book
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Bus style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <p className="font-semibold text-base">
          Airport Transfers{airportCode ? ` (${airportCode})` : ''}
        </p>
        {isLowSafety && (
          <div className="flex items-center gap-1 ml-2">
            <Shield style={{ height: 14, width: 14, color: 'var(--warning)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>Recommended</p>
          </div>
        )}
      </div>

      {isLowSafety && (
        <div className="p-3 mb-3" style={{ backgroundColor: 'hsl(var(--warning) / 0.15)' }}>
          <p className="text-xs">
            This destination has a lower LGBTQ+ safety score. We recommend booking a private transfer for a safer, more comfortable arrival.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <p className="font-semibold text-sm mb-1">Kiwitaxi</p>
            <p className="text-xs text-muted-foreground mb-3">
              Pre-booked airport pickup, fixed price, meet & greet
            </p>
            <Button size="sm" className="w-full" onClick={() => window.open(kiwitaxiUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Book Transfer
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent style={{ padding: 16 }}>
            <p className="font-semibold text-sm mb-1">GetTransfer</p>
            <p className="text-xs text-muted-foreground mb-3">
              Private drivers, any route, competitive bidding
            </p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(getTransferUrl, '_blank', 'noopener')}>
              <ExternalLink style={{ height: 14, width: 14, marginRight: 4 }} />
              Get Quotes
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

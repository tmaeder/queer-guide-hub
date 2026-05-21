import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Phone, Globe, Star, Clock } from 'lucide-react';

interface VenueData {
  name?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  category?: string;
  price_range?: number;
  latitude?: number;
  longitude?: number;
  rating?: number;
  hours?: string;
  images?: string[];
}

interface EnrichmentResult {
  source: string;
  status: string;
  data: VenueData;
}

interface VenueEnrichmentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  results: EnrichmentResult[];
  onSelectResult: (data: VenueData) => void;
  venueName: string;
}

export function VenueEnrichmentPreview({
  isOpen,
  onClose,
  results,
  onSelectResult,
  venueName,
}: VenueEnrichmentPreviewProps) {
  const getSourceBadgeVariant = (source: string) => {
    switch (source) {
      case 'foursquare':
        return 'default';
      case 'google':
        return 'secondary';
      case 'tomtom':
        return 'outline';
      case 'tripadvisor':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const formatSourceName = (source: string) => {
    switch (source) {
      case 'foursquare':
        return 'Foursquare';
      case 'google':
        return 'Google Places';
      case 'tomtom':
        return 'TomTom';
      case 'tripadvisor':
        return 'TripAdvisor';
      default:
        return source;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 896, maxHeight: '80vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Choose Venue Data Source for "{venueName}"</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((result, index) => (
            <Card key={index} className="cursor-pointer transition-colors hover:bg-muted/40">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{result.data.name || venueName}</CardTitle>
                  <Badge variant={getSourceBadgeVariant(result.source)}>
                    {formatSourceName(result.source)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                {result.data.address && (
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="mt-0.5 text-muted-foreground shrink-0" />
                    <p className="text-sm">{result.data.address}</p>
                  </div>
                )}

                {result.data.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-muted-foreground shrink-0" />
                    <p className="text-sm">{result.data.phone}</p>
                  </div>
                )}

                {result.data.website && (
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-muted-foreground shrink-0" />
                    <p className="text-sm truncate">{result.data.website}</p>
                  </div>
                )}

                {result.data.rating && (
                  <div className="flex items-center gap-2">
                    <Star size={16} className="text-muted-foreground shrink-0" />
                    <p className="text-sm">{result.data.rating}/10</p>
                  </div>
                )}

                {result.data.hours && (
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-muted-foreground shrink-0" />
                    <p className="text-sm">{result.data.hours}</p>
                  </div>
                )}

                {result.data.category && (
                  <Badge variant="outline" className="text-xs">
                    {result.data.category}
                  </Badge>
                )}

                {result.data.description && (
                  <p
                    className="text-sm text-muted-foreground overflow-hidden"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {result.data.description}
                  </p>
                )}

                <Button
                  onClick={() => onSelectResult(result.data)}
                  style={{ width: '100%', marginTop: 16 }}
                  size="sm"
                >
                  Use This Data
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

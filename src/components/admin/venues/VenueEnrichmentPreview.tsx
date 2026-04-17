import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Phone, Globe, Star, Clock } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  venueName
}: VenueEnrichmentPreviewProps) {
  const getSourceBadgeVariant = (source: string) => {
    switch (source) {
      case 'foursquare': return 'default';
      case 'google': return 'secondary';
      case 'tomtom': return 'outline';
      case 'tripadvisor': return 'destructive';
      default: return 'default';
    }
  };

  const formatSourceName = (source: string) => {
    switch (source) {
      case 'foursquare': return 'Foursquare';
      case 'google': return 'Google Places';
      case 'tomtom': return 'TomTom';
      case 'tripadvisor': return 'TripAdvisor';
      default: return source;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 896, maxHeight: '80vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Choose Venue Data Source for "{venueName}"</DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {results.map((result, index) => (
            <Card key={index} style={{ cursor: 'pointer', transition: 'box-shadow 0.2s' }}>
              <CardHeader style={{ paddingBottom: 12 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <CardTitle style={{ fontSize: '1.125rem' }}>{result.data.name || venueName}</CardTitle>
                  <Badge variant={getSourceBadgeVariant(result.source)}>
                    {formatSourceName(result.source)}
                  </Badge>
                </Box>
              </CardHeader>

              <CardContent>
                {result.data.address && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <MapPin style={{ height: 16, width: 16, marginTop: 2, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <Typography variant="body2">{result.data.address}</Typography>
                  </Box>
                )}

                {result.data.phone && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Phone style={{ height: 16, width: 16, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <Typography variant="body2">{result.data.phone}</Typography>
                  </Box>
                )}

                {result.data.website && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Globe style={{ height: 16, width: 16, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.data.website}</Typography>
                  </Box>
                )}

                {result.data.rating && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Star style={{ height: 16, width: 16, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <Typography variant="body2">{result.data.rating}/10</Typography>
                  </Box>
                )}

                {result.data.hours && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <Typography variant="body2">{result.data.hours}</Typography>
                  </Box>
                )}

                {result.data.category && (
                  <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                    {result.data.category}
                  </Badge>
                )}

                {result.data.description && (
                  <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {result.data.description}
                  </Typography>
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
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

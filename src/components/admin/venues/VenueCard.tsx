import { MapPin, Edit, Trash2, Star, CheckCircle, ExternalLink, Phone, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenueData {
  name: string;
  category?: string;
  featured?: boolean;
  verified?: boolean;
  city?: string;
  state?: string;
  price_range?: number;
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  tags?: string[];
}

interface VenueCardProps {
  venue: VenueData;
  onEdit: (venue: VenueData) => void;
  onDelete: (venue: VenueData) => void;
}

export function VenueCard({ venue, onEdit, onDelete }: VenueCardProps) {
  const getPriceDisplay = (priceRange: number) => {
    return "$".repeat(Math.max(1, Math.min(4, priceRange || 1)));
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'flex-start' }, justifyContent: { md: 'space-between' } }}>
          {/* Main Content */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 'tight' }}>{venue.name}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Badge variant="outline">
                  {venue.category}
                </Badge>
                {venue.featured && (
                  <Badge>
                    <Star style={{ width: 12, height: 12, marginRight: 4 }} />
                    Featured
                  </Badge>
                )}
                {venue.verified && (
                  <Badge>
                    <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                    Verified
                  </Badge>
                )}
              </Box>
            </Box>

            {/* Location & Price */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MapPin style={{ width: 12, height: 12 }} />
                <Typography component="span">{venue.city}{venue.state && `, ${venue.state}`}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" sx={{ fontWeight: 500 }}>Price: {getPriceDisplay(venue.price_range)}</Typography>
              </Box>
            </Box>

            {/* Description */}
            {venue.description && (
              <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {venue.description}
              </Typography>
            )}

            {/* Contact Info */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
              {venue.phone && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Phone style={{ width: 12, height: 12 }} />
                  <Typography component="span">{venue.phone}</Typography>
                </Box>
              )}
              {venue.email && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Mail style={{ width: 12, height: 12 }} />
                  <Typography component="span">{venue.email}</Typography>
                </Box>
              )}
              {venue.website && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ExternalLink style={{ width: 12, height: 12 }} />
                  <Typography component="span">Website</Typography>
                </Box>
              )}
            </Box>

            {/* Tags */}
            {venue.tags && venue.tags.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {venue.tags.slice(0, 3).map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
                {venue.tags.length > 3 && (
                  <Badge variant="secondary">
                    +{venue.tags.length - 3} more
                  </Badge>
                )}
              </Box>
            )}
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1, flexDirection: { md: 'column' } }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(venue)}

            >
              <Edit style={{ width: 16, height: 16, marginRight: { md: 8 } }} />
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Edit</Box>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(venue)}

            >
              <Trash2 style={{ width: 16, height: 16, marginRight: { md: 8 } }} />
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Delete</Box>
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
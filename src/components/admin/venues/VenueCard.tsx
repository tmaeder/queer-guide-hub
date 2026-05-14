import { MapPin, Edit, Trash2, Star, CheckCircle, ExternalLink, Phone, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  is_featured?: boolean;
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
        <div className="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-2">
              <h6 className="text-base font-semibold leading-tight">{venue.name}</h6>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{venue.category}</Badge>
                {venue.is_featured && (
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
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MapPin style={{ width: 12, height: 12 }} />
                <span>{venue.city}{venue.state && `, ${venue.state}`}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">Price: {getPriceDisplay(venue.price_range)}</span>
              </div>
            </div>

            {venue.description && (
              <p
                className="text-sm text-muted-foreground"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
              >
                {venue.description}
              </p>
            )}

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {venue.phone && (
                <div className="flex items-center gap-1">
                  <Phone style={{ width: 12, height: 12 }} />
                  <span>{venue.phone}</span>
                </div>
              )}
              {venue.email && (
                <div className="flex items-center gap-1">
                  <Mail style={{ width: 12, height: 12 }} />
                  <span>{venue.email}</span>
                </div>
              )}
              {venue.website && (
                <div className="flex items-center gap-1">
                  <ExternalLink style={{ width: 12, height: 12 }} />
                  <span>Website</span>
                </div>
              )}
            </div>

            {venue.tags && venue.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
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
              </div>
            )}
          </div>

          <div className="flex md:flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(venue)}>
              <Edit style={{ width: 16, height: 16 }} className="md:mr-2" />
              <span className="hidden md:inline">Edit</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(venue)}>
              <Trash2 style={{ width: 16, height: 16 }} className="md:mr-2" />
              <span className="hidden md:inline">Delete</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

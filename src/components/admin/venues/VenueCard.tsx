import { MapPin, Edit, Trash2, Star, CheckCircle, ExternalLink, Phone, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface VenueCardProps {
  venue: any;
  onEdit: (venue: any) => void;
  onDelete: (venue: any) => void;
}

export function VenueCard({ venue, onEdit, onDelete }: VenueCardProps) {
  const getPriceDisplay = (priceRange: number) => {
    return "$".repeat(Math.max(1, Math.min(4, priceRange || 1)));
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 hover:border-primary/20">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Main Content */}
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="font-semibold text-lg leading-tight">{venue.name}</h3>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  {venue.category}
                </Badge>
                {venue.featured && (
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Featured
                  </Badge>
                )}
                {venue.verified && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
            </div>

            {/* Location & Price */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{venue.city}{venue.state && `, ${venue.state}`}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">Price: {getPriceDisplay(venue.price_range)}</span>
              </div>
            </div>

            {/* Description */}
            {venue.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {venue.description}
              </p>
            )}

            {/* Contact Info */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {venue.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{venue.phone}</span>
                </div>
              )}
              {venue.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span>{venue.email}</span>
                </div>
              )}
              {venue.website && (
                <div className="flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  <span>Website</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {venue.tags && venue.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {venue.tags.slice(0, 3).map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {venue.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{venue.tags.length - 3} more
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 md:flex-col">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(venue)}
              className="flex-1 md:flex-none"
            >
              <Edit className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Edit</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(venue)}
              className="flex-1 md:flex-none"
            >
              <Trash2 className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Delete</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
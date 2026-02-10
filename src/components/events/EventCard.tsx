import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Clock, DollarSign, ExternalLink, Star, Ticket, Heart, Eye } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { formatEventTime } from '@/lib/event-time';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { cn } from '@/lib/utils';

type Event = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
  } | null;
};

interface EventCardProps {
  event: Event & {
    event_attendees?: Array<{ status: string }>;
  };
  onViewDetails?: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}

export function EventCard({ event, onViewDetails, onUpdateAttendance }: EventCardProps) {
  const attendeeCount = event.event_attendees?.filter(a => a.status === 'going').length || 0;

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      party: 'bg-primary/10 text-primary',
      workshop: 'bg-accent/10 text-accent',
      meetup: 'bg-secondary/10 text-secondary',
      pride: 'bg-primary text-primary-foreground',
      rally: 'bg-destructive/10 text-destructive',
    };
    return colors[type] || 'bg-muted/10 text-muted-foreground';
  };

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    return format(start, 'MMM d, yyyy');
  };

  const getPriceDisplay = () => {
    if (event.is_free) return 'Free';
    if (event.price_min && event.price_max) {
      if (event.price_min === event.price_max) {
        return `$${event.price_min}`;
      }
      return `$${event.price_min} - $${event.price_max}`;
    }
    if (event.price_min) return `From $${event.price_min}`;
    return 'Price TBA';
  };

  return (
    <Card className="group relative overflow-hidden bg-card hover:opacity-90 transition-opacity duration-500">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-primary/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Event Images */}
      {event.images && event.images.length > 0 ? (
        <div className="relative h-56 overflow-hidden">
          <div className="absolute inset-0 bg-foreground/20 z-10" />
          <img
            src={event.images[0]}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
          
          {/* Image Overlay Content */}
          <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start">
            <div className="flex gap-2">
              {event.featured && (
                <Badge className="bg-primary text-primary-foreground">
                  <Star className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
              <Badge className={cn(
                "bg-muted text-foreground",
                getEventTypeColor(event.event_type)
              )}>
                {event.event_type}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {event.images.length > 1 && (
                <Badge variant="secondary" className="bg-muted text-foreground">
                  +{event.images.length - 1} photos
                </Badge>
              )}
            </div>
          </div>

          {/* Price Badge */}
          <div className="absolute bottom-4 right-4 z-20">
            {event.is_free ? (
              <Badge className="bg-success text-success-foreground text-sm px-3 py-1">
                <Ticket className="h-3 w-3 mr-1" />
                Free
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-muted text-foreground text-sm px-3 py-1">
                <DollarSign className="h-3 w-3 mr-1" />
                {getPriceDisplay()}
              </Badge>
            )}
          </div>
        </div>
      ) : (
        // Placeholder for events without images
        <div className="relative h-56 bg-primary/10 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto bg-primary/20 rounded-lg flex items-center justify-center">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
            <div className="flex gap-2 justify-center">
              {event.featured && (
                <Badge className="bg-primary text-primary-foreground">
                  <Star className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
              <Badge className={getEventTypeColor(event.event_type)}>
                {event.event_type}
              </Badge>
            </div>
          </div>
          
          {/* Price Badge for no-image cards */}
          <div className="absolute bottom-4 right-4">
            {event.is_free ? (
              <Badge className="bg-success text-success-foreground">
                <Ticket className="h-3 w-3 mr-1" />
                Free
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-background">
                <DollarSign className="h-3 w-3 mr-1" />
                {getPriceDisplay()}
              </Badge>
            )}
          </div>
        </div>
      )}

      <CardHeader className="relative z-10 space-y-4 pb-4">
        <CardTitle className="text-xl font-bold leading-tight group-hover:text-primary transition-colors duration-300 line-clamp-2">
          {event.title}
        </CardTitle>
        
        {/* Date and Time Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-lg">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{formatEventDate(event.start_date, event.end_date)}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{formatEventTime(event.start_date, event.end_date)}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 space-y-4 pt-0">
        {/* Description */}
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {event.description}
          </p>
        )}

        {/* Location */}
        <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {event.venues?.name || event.venue_name || 'Location TBA'}
            </p>
            <p className="text-xs text-muted-foreground">
              {event.city}, {event.state}
            </p>
            {event.venues?.address && (
              <p className="text-xs text-muted-foreground mt-1">
                {event.venues.address}
              </p>
            )}
          </div>
        </div>

        {/* Event Stats */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Users className="h-3 w-3 text-primary" />
              </div>
              <span className="text-sm font-medium">{attendeeCount} attending</span>
            </div>
            
            {event.age_restriction && (
              <Badge variant="outline" className="text-xs bg-muted/50">
                {event.age_restriction}
              </Badge>
            )}
          </div>
          
          <FavoriteButton itemId={event.id} type="event" />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t border-border/50">
          <Link to={`/events/${event.id}`} className="flex-1">
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full hover:bg-primary hover:text-primary-foreground transition-all duration-300 group/btn"
            >
              <Eye className="h-4 w-4 mr-2 group-hover/btn:scale-110 transition-transform" />
              View Details
            </Button>
          </Link>
          
          {/* External Links */}
          <div className="flex gap-1">
            {event.venues?.website && (
              <Button size="sm" variant="outline" className="px-3 hover:bg-primary/10" asChild>
                <a href={event.venues.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            {event.ticket_url && (
              <Button size="sm" variant="default" className="px-3 bg-primary hover:opacity-90" asChild>
                <a href={event.ticket_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <Ticket className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Attendance Buttons */}
        {onUpdateAttendance && (
          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              variant="default" 
              className="flex-1 bg-success text-success-foreground hover:opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateAttendance(event.id, 'going');
              }}
            >
              <Heart className="h-4 w-4 mr-2" />
              I'm Going
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 hover:opacity-90"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateAttendance(event.id, 'interested');
              }}
            >
              <Star className="h-4 w-4 mr-2" />
              Interested
            </Button>
          </div>
        )}

        {/* Venue Contact Info */}
        {event.venues?.phone && (
          <div className="text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span>Contact: {event.venues.phone}</span>
          </div>
        )}
      </CardContent>

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 rounded-lg bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    </Card>
  );
}
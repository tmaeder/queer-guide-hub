import { useState, useEffect } from 'react';
import { Users, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';
import { formatDistanceToNow } from 'date-fns';

interface VenueRecentCheckinsProps {
  venueId: string;
  refreshTrigger?: number;
}

export function VenueRecentCheckins({ venueId, refreshTrigger }: VenueRecentCheckinsProps) {
  const [checkins, setCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { getVenueCheckins } = useVenueCheckins();

  useEffect(() => {
    const fetchCheckins = async () => {
      setLoading(true);
      const data = await getVenueCheckins(venueId);
      setCheckins(data);
      setLoading(false);
    };

    fetchCheckins();
  }, [venueId, getVenueCheckins, refreshTrigger]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Recent Check-ins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-full" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Recent Check-ins ({checkins.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {checkins.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No check-ins yet</p>
            <p className="text-sm">Be the first to check in at this venue!</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {checkins.map((checkin) => (
              <div key={checkin.id} className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={checkin.profiles?.avatar_url} />
                  <AvatarFallback>
                    {checkin.profiles?.display_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {checkin.profiles?.display_name || 'Anonymous User'}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(checkin.checked_in_at), { addSuffix: true })}
                    </span>
                    {checkin.distance_meters && (
                      <>
                        <span>•</span>
                        <span>{Math.round(checkin.distance_meters)}m away</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
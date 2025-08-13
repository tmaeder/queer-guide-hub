import { useState, useEffect } from 'react';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';

interface VenueRecentCheckinsProps {
  venueId: string;
  refreshTrigger?: number;
}

export function VenueRecentCheckins({ venueId, refreshTrigger }: VenueRecentCheckinsProps) {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { getVenueCheckins } = useVenueCheckins();

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const data = await getVenueCheckins(venueId);
      setStats(data);
      setLoading(false);
    };

    fetchStats();
  }, [venueId, getVenueCheckins, refreshTrigger]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Venue Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCheckins = stats.reduce((sum, stat) => sum + (stat.total_checkins || 0), 0);
  const recentActivity = stats.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Venue Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-sm">Check-in data is private and anonymized</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center p-4 bg-primary/5 rounded-lg border">
              <div className="text-2xl font-bold text-primary">{totalCheckins}</div>
              <div className="text-sm text-muted-foreground">Total visits (30 days)</div>
            </div>
            
            {recentActivity.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recent Activity Hours
                </h4>
                {recentActivity.map((stat, index) => (
                  <div key={index} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded">
                    <span className="text-sm">
                      {new Date(stat.checkin_hour).toLocaleDateString([], { 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit'
                      })}
                    </span>
                    <span className="text-sm font-medium">
                      {stat.total_checkins} visit{stat.total_checkins !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
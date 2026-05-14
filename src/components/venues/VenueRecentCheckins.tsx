import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';

interface VenueRecentCheckinsProps {
  venueId: string;
  refreshTrigger?: number;
}

type CheckinStat = Record<string, unknown>;
type Status = 'loading' | 'error' | 'ready';

export function VenueRecentCheckins({ venueId, refreshTrigger }: VenueRecentCheckinsProps) {
  const [stats, setStats] = useState<CheckinStat[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const { getVenueCheckins } = useVenueCheckins();

  const fetchStats = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await getVenueCheckins(venueId);
      setStats(data ?? []);
      setStatus('ready');
    } catch {
      setStats([]);
      setStatus('error');
    }
  }, [venueId, getVenueCheckins]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, refreshTrigger]);

  const header = (
    <CardHeader>
      <CardTitle>
        <BarChart3 style={{ width: 20, height: 20 }} />
        Venue Activity
      </CardTitle>
    </CardHeader>
  );

  if (status === 'loading') {
    return (
      <Card>
        {header}
        <CardContent>
          <div
            role="status"
            aria-label="Loading venue activity"
            aria-busy="true"
            className="flex flex-col gap-3 animate-pulse"
          >
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 bg-muted w-1/2" />
                <div className="h-4 bg-muted w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        {header}
        <CardContent>
          <div role="alert" className="text-center py-6">
            <p className="font-semibold mb-2">Couldn't load recent activity</p>
            <p className="text-sm text-muted-foreground mb-4">Please try again in a moment.</p>
            <Button variant="outline" onClick={fetchStats}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        {header}
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <TrendingUp style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }} />
            <p>No recent activity</p>
            <p className="text-sm">Check-in data is private and anonymized</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCheckins = stats.reduce(
    (sum, stat) => sum + ((stat.total_checkins as number) || 0),
    0,
  );
  const recentActivity = stats.slice(0, 5);

  return (
    <Card>
      {header}
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="text-center p-4 border border-border" style={{ backgroundColor: 'hsl(var(--primary) / 0.05)' }}>
            <p className="text-2xl font-bold text-primary">{totalCheckins}</p>
            <p className="text-sm text-muted-foreground">Total visits (30 days)</p>
          </div>

          {recentActivity.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Clock style={{ width: 16, height: 16 }} />
                Recent Activity Hours
              </p>
              {recentActivity.map((stat, index) => {
                const hour = stat.checkin_hour as string | undefined;
                const count = Number(stat.total_checkins) || 0;
                return (
                  <div key={index} className="flex items-center justify-between py-2 px-3 bg-muted">
                    <p className="text-sm">
                      {hour ? new Date(hour).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' }) : ''}
                    </p>
                    <p className="text-sm font-medium">
                      {count} visit{count !== 1 ? 's' : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

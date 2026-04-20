import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
          <Box
            role="status"
            aria-label="Loading venue activity"
            aria-busy="true"
            sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
          >
            {[1, 2, 3].map((i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '50%' }} />
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: 64 }} />
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        {header}
        <CardContent>
          <Box role="alert" sx={{ textAlign: 'center', py: 3 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Couldn't load recent activity</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Please try again in a moment.
            </Typography>
            <Button variant="outline" onClick={fetchStats}>Retry</Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        {header}
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <TrendingUp style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }} />
            <Typography>No recent activity</Typography>
            <Typography variant="body2">Check-in data is private and anonymized</Typography>
          </Box>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(var(--primary-rgb), 0.05)', borderRadius: 2, border: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'primary.main' }}>{totalCheckins}</Typography>
            <Typography variant="body2" color="text.secondary">Total visits (30 days)</Typography>
          </Box>

          {recentActivity.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Clock style={{ width: 16, height: 16 }} />
                Recent Activity Hours
              </Typography>
              {recentActivity.map((stat, index) => {
                const hour = stat.checkin_hour as string | undefined;
                const count = Number(stat.total_checkins) || 0;
                return (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, px: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">
                      {hour ? new Date(hour).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' }) : ''}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {count} visit{count !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

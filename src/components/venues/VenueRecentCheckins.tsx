import { useState, useEffect } from 'react';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVenueCheckins } from '@/hooks/useVenueCheckins';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenueRecentCheckinsProps {
  venueId: string;
  refreshTrigger?: number;
}

export function VenueRecentCheckins({ venueId, refreshTrigger }: VenueRecentCheckinsProps) {
  const [stats, setStats] = useState<Record<string, unknown>[]>([]);
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
          <CardTitle>
            <BarChart3 style={{ width: 20, height: 20 }} />
            Venue Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
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

  const totalCheckins = stats.reduce((sum, stat) => sum + (stat.total_checkins || 0), 0);
  const recentActivity = stats.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <BarChart3 style={{ width: 20, height: 20 }} />
          Venue Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <TrendingUp style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }} />
            <Typography>No recent activity</Typography>
            <Typography variant="body2">Check-in data is private and anonymized</Typography>
          </Box>
        ) : (
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
                {recentActivity.map((stat, index) => (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, px: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">
                      {new Date(stat.checkin_hour).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit'
                      })}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {stat.total_checkins} visit{stat.total_checkins !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
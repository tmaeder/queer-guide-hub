import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Users, UserPlus, Activity, ShieldAlert } from 'lucide-react';

function useUserStats() {
  return useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [total, newThisWeek, activeNow, modIssues] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_online', true),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .neq('moderation_status' as const, 'approved'),
      ]);

      return {
        totalUsers: total.count ?? 0,
        newThisWeek: newThisWeek.count ?? 0,
        activeNow: activeNow.count ?? 0,
        moderationIssues: modIssues.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

const cards = [
  { key: 'totalUsers', label: 'Total Users', icon: Users, color: '#6366f1' },
  { key: 'newThisWeek', label: 'New This Week', icon: UserPlus, color: '#22c55e' },
  { key: 'activeNow', label: 'Active Now', icon: Activity, color: '#3b82f6' },
  { key: 'moderationIssues', label: 'Moderation Issues', icon: ShieldAlert, color: '#ef4444' },
] as const;

export function UserStatsCards() {
  const { data, isLoading } = useUserStats();

  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}
    >
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <CardTitle>
                {card.label}
              </CardTitle>
              <card.icon style={{ height: 16, width: 16, color: card.color }} />
            </Box>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton width={60} height={36} />
            ) : (
              <Typography variant="h4" sx={{ fontWeight: 700, fontSize: '1.75rem' }}>
                {(data?.[card.key] ?? 0).toLocaleString()}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

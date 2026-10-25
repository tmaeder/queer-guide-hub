import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserPlus, Activity, ShieldAlert } from '@/components/icons';

function useUserStats() {
  return useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_stats');
      if (error) throw error;
      const stats = data as Record<string, number> | null;
      if (
        !stats ||
        ['total', 'new_this_week', 'online', 'needs_moderation'].some(
          (key) => typeof stats[key] !== 'number',
        )
      ) {
        throw new Error('Invalid user statistics response');
      }
      return {
        totalUsers: stats.total,
        newThisWeek: stats.new_this_week,
        activeNow: stats.online,
        moderationIssues: stats.needs_moderation,
      };
    },
    staleTime: 60_000,
  });
}

const cards = [
  { key: 'totalUsers', label: 'Total Users', icon: Users, color: 'hsl(var(--muted-foreground))' },
  { key: 'newThisWeek', label: 'New This Week', icon: UserPlus, color: 'hsl(var(--foreground))' },
  { key: 'activeNow', label: 'Active Now', icon: Activity, color: 'hsl(var(--muted-foreground))' },
  {
    key: 'moderationIssues',
    label: 'Moderation Issues',
    icon: ShieldAlert,
    color: 'hsl(var(--destructive))',
  },
] as const;

export function UserStatsCards() {
  const { data, isLoading, isError, isFetching, refetch } = useUserStats();

  return (
    <div className="space-y-4">
      {isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>Could not load user statistics.</span>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            Retry statistics
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{card.label}</CardTitle>
                <card.icon style={{ height: 16, width: 16, color: card.color }} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="w-16 h-9" />
              ) : (
                <p className="text-3xl font-bold">{data?.[card.key]?.toLocaleString() ?? '—'}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

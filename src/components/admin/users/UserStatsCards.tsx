import { useQuery } from '@tanstack/react-query';
import { countRows } from '@/hooks/usePageFetchers';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserPlus, Activity, ShieldAlert } from 'lucide-react';

function useUserStats() {
  return useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [totalUsers, newThisWeek, activeNow, moderationIssues] = await Promise.all([
        countRows('profiles'),
        countRows('profiles', { col: 'created_at', op: 'gte', val: weekAgo }),
        countRows('profiles', { col: 'is_online', op: 'eq', val: true }),
        countRows('profiles', { col: 'moderation_status', op: 'neq', val: 'approved' }),
      ]);
      return { totalUsers, newThisWeek, activeNow, moderationIssues };
    },
    staleTime: 60_000,
  });
}

const cards = [
  { key: 'totalUsers', label: 'Total Users', icon: Users, color: 'hsl(var(--muted-foreground))' },
  { key: 'newThisWeek', label: 'New This Week', icon: UserPlus, color: 'hsl(var(--foreground))' },
  { key: 'activeNow', label: 'Active Now', icon: Activity, color: 'hsl(var(--muted-foreground))' },
  { key: 'moderationIssues', label: 'Moderation Issues', icon: ShieldAlert, color: 'hsl(var(--destructive))' },
] as const;

export function UserStatsCards() {
  const { data, isLoading } = useUserStats();

  return (
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
              <p className="text-3xl font-bold">{(data?.[card.key] ?? 0).toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

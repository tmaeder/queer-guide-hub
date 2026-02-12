import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Clock, ArrowUpRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  icon: any;
  badge: string;
}

interface RecentActivityProps {
  activities: ActivityItem[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function RecentActivity({ activities, loading, onRefresh }: RecentActivityProps) {
  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'post': return 'default';
      case 'event': return 'secondary';
      case 'marketplace': return 'outline';
      case 'user': return 'default';
      case 'venue': return 'secondary';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Clock style={{ width: 16, height: 16 }} />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[...Array(5)].map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 , animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
              <Skeleton sx={{ height: 32, width: 32, borderRadius: '50%' }} />
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Skeleton sx={{ height: 16, width: 128 }} />
                <Skeleton sx={{ height: 12, width: 192 }} />
                <Skeleton sx={{ height: 12, width: 80 }} />
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', py: 0 }}>
        <CardTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Clock style={{ width: 16, height: 16 }} />
          Recent Activity
        </CardTitle>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            sx={{ height: 32, width: 32, p: 0 }}
          >
            <RefreshCw style={{ width: 16, height: 16 }} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Clock style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }} />
            <Typography>No recent activity</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activities.map((activity) => {
              const Icon = activity.icon;
              return (
                <Box key={activity.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&:hover .arrow': { opacity: 1 } }}>
                  <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: '50%' }}>
                    <Icon style={{ width: 16, height: 16 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activity.title}
                      </Typography>
                      <Badge
                        variant={getBadgeVariant(activity.type)}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        {activity.badge}
                      </Badge>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', mb: 0.5 }}>
                      {activity.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </Typography>
                  </Box>
                  <ArrowUpRight style={{ width: 16, height: 16, color: 'var(--muted-foreground)', opacity: 0, transition: 'opacity 0.2s' }} />
                </Box>
              );
            })}

            {activities.length > 0 && (
              <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button variant="ghost" size="sm" sx={{ width: '100%' }}>
                  View All Activity
                  <ArrowUpRight style={{ width: 16, height: 16, marginLeft: 8 }} />
                </Button>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Clock, ArrowUpRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
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
          <CardTitle>
            <Clock style={{ width: 16, height: 16 }} />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-row items-start gap-3 animate-pulse">
              <Skeleton />
              <div className="flex-1 flex flex-col gap-2">
                <Skeleton />
                <Skeleton />
                <Skeleton />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Clock style={{ width: 16, height: 16 }} />
          Recent Activity
        </CardTitle>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}

          >
            <RefreshCw style={{ width: 16, height: 16 }} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }} />
            <p>No recent activity</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {activities.map((activity) => {
              const Icon = activity.icon;
              return (
                <div key={activity.id} className="flex flex-row items-start gap-3 group">
                  <div className="p-2 bg-muted rounded-full">
                    <Icon style={{ width: 16, height: 16 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-row items-center gap-2 mb-1">
                      <p className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                        {activity.title}
                      </p>
                      <Badge variant={getBadgeVariant(activity.type)}>
                        {activity.badge}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap block mb-1">
                      {activity.description}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  <ArrowUpRight
                    style={{ width: 16, height: 16 }}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              );
            })}

            {activities.length > 0 && (
              <div className="pt-4 border-t border-border">
                <Button variant="ghost" size="sm">
                  View All Activity
                  <ArrowUpRight style={{ width: 16, height: 16, marginLeft: 8 }} />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

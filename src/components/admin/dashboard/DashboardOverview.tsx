import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  Users,
  Building,
  Calendar,
  ShoppingBag,
  Activity,
  Globe,
  Eye,
  ArrowUpRight,
} from 'lucide-react';
import { useNavigate } from 'react-router';

interface DashboardStats {
  totalUsers: number;
  activeVenues: number;
  upcomingEvents: number;
  marketplaceItems: number;
  totalGroups: number;
  totalPosts: number;
  weeklyGrowth: number;
  monthlyUsers: number;
  conversionRate: number;
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'error';
  uptime: string;
  dbLatency: number;
  storageUsed: number;
}

interface DashboardOverviewProps {
  stats: DashboardStats;
  systemHealth: SystemHealth;
  statsLoading: boolean;
}

export function DashboardOverview({ stats, systemHealth, statsLoading }: DashboardOverviewProps) {
  const navigate = useNavigate();

  const overviewCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      change: `+${stats.weeklyGrowth}%`,
      changeType: 'positive' as const,
      icon: Users,
      description: 'Active community members',
      onClick: () => navigate('/admin/users'),
    },
    {
      title: 'Active Venues',
      value: stats.activeVenues.toLocaleString(),
      change: '+12%',
      changeType: 'positive' as const,
      icon: Building,
      description: 'Listed locations',
      onClick: () => navigate('/admin/venues'),
    },
    {
      title: 'Upcoming Events',
      value: stats.upcomingEvents.toLocaleString(),
      change: '+8%',
      changeType: 'positive' as const,
      icon: Calendar,
      description: 'Scheduled events',
      onClick: () => navigate('/admin/events'),
    },
    {
      title: 'Marketplace Items',
      value: stats.marketplaceItems.toLocaleString(),
      change: '+5%',
      changeType: 'positive' as const,
      icon: ShoppingBag,
      description: 'Active listings',
      onClick: () => navigate('/admin/marketplace'),
    },
  ];

  const systemCards = [
    {
      title: 'System Health',
      value: systemHealth.status,
      icon: Activity,
      color:
        systemHealth.status === 'healthy'
          ? 'text-green-600'
          : systemHealth.status === 'warning'
            ? 'text-yellow-600'
            : 'text-red-600',
    },
    {
      title: 'Uptime',
      value: systemHealth.uptime,
      icon: Globe,
      color: 'text-blue-600',
    },
    {
      title: 'DB Latency',
      value: `${systemHealth.dbLatency}ms`,
      icon: Activity,
      color: systemHealth.dbLatency < 100 ? 'text-green-600' : 'text-yellow-600',
    },
    {
      title: 'Storage Used',
      value: `${systemHealth.storageUsed}%`,
      icon: Eye,
      color: systemHealth.storageUsed < 80 ? 'text-green-600' : 'text-red-600',
    },
  ];

  if (statsLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16 mb-2"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Key Metrics */}
      <div>
        <h6 className="text-base font-semibold mb-4 flex items-center gap-2">
          <TrendingUp style={{ height: 20, width: 20 }} />
          Key Metrics
        </h6>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {overviewCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} onClick={card.onClick}>
                <CardHeader>
                  <CardTitle>{card.title}</CardTitle>
                  <Icon style={{ height: 16, width: 16, color: 'rgba(0, 0, 0, 0.6)' }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={card.changeType === 'positive' ? 'default' : 'destructive'}>
                      {card.change}
                    </Badge>
                    <span className="text-xs">{card.description}</span>
                    <ArrowUpRight style={{ height: 12, width: 12, marginLeft: 'auto' }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* System Health */}
      <div>
        <h6 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Activity style={{ height: 20, width: 20 }} />
          System Health
        </h6>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {systemCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <Icon style={{ height: 16, width: 16 }} className={card.color} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{card.title}</p>
                      <h6 className={`text-base font-semibold ${card.color}`}>{card.value}</h6>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-sm">Used Storage</span>
              <span className="text-sm">{systemHealth.storageUsed}% of limit</span>
            </div>
            <Progress value={systemHealth.storageUsed} />
            <span className="text-xs text-muted-foreground">
              {systemHealth.storageUsed < 80
                ? 'Storage usage is within normal limits'
                : 'Consider archiving old data or upgrading storage'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

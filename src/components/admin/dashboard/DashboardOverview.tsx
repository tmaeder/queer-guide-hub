import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Box, Typography } from '@mui/material';
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
          }}
        >
          {[...Array(4)].map((_, i) => (
            <Card
              key={i}

            >
              <CardHeader>
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: 96 }}></Box>
              </CardHeader>
              <CardContent>
                <Box
                  sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: 64, mb: 1 }}
                ></Box>
                <Box sx={{ height: 12, bgcolor: 'action.hover', borderRadius: 1, width: 80 }}></Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Key Metrics */}
      <Box>
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <TrendingUp style={{ height: 20, width: 20 }} />
          Key Metrics
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
          }}
        >
          {overviewCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.title}

                onClick={card.onClick}
              >
                <CardHeader

                >
                  <CardTitle>{card.title}</CardTitle>
                  <Icon style={{ height: 16, width: 16, color: 'rgba(0, 0, 0, 0.6)' }} />
                </CardHeader>
                <CardContent>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                    {card.value}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      fontSize: 12,
                      color: 'text.secondary',
                    }}
                  >
                    <Badge
                      variant={card.changeType === 'positive' ? 'default' : 'destructive'}

                    >
                      {card.change}
                    </Badge>
                    <Typography component="span" variant="caption">
                      {card.description}
                    </Typography>
                    <ArrowUpRight style={{ height: 12, width: 12, marginLeft: 'auto' }} />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Box>

      {/* System Health */}
      <Box>
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <Activity style={{ height: 20, width: 20 }} />
          System Health
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
          }}
        >
          {systemCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'action.hover' }}>
                      <Icon style={{ height: 16, width: 16, color: card.color }} />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {card.title}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: card.color }}>
                        {card.value}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Box>

      {/* Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <Typography component="span" variant="body2">
                Used Storage
              </Typography>
              <Typography component="span" variant="body2">
                {systemHealth.storageUsed}% of limit
              </Typography>
            </Box>
            <Progress value={systemHealth.storageUsed} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {systemHealth.storageUsed < 80
                ? 'Storage usage is within normal limits'
                : 'Consider archiving old data or upgrading storage'}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

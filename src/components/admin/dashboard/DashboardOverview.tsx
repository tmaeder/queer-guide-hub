import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Users, Building, Calendar, ShoppingBag, MessageSquare, Activity, Globe, Eye, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
      title: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      change: `+${stats.weeklyGrowth}%`,
      changeType: "positive" as const,
      icon: Users,
      description: "Active community members",
      onClick: () => navigate("/admin/users")
    },
    {
      title: "Active Venues",
      value: stats.activeVenues.toLocaleString(),
      change: "+12%",
      changeType: "positive" as const,
      icon: Building,
      description: "Listed locations",
      onClick: () => navigate("/admin/venues")
    },
    {
      title: "Upcoming Events",
      value: stats.upcomingEvents.toLocaleString(),
      change: "+8%",
      changeType: "positive" as const,
      icon: Calendar,
      description: "Scheduled events",
      onClick: () => navigate("/admin/events")
    },
    {
      title: "Marketplace Items",
      value: stats.marketplaceItems.toLocaleString(),
      change: "+5%",
      changeType: "positive" as const,
      icon: ShoppingBag,
      description: "Active listings",
      onClick: () => navigate("/admin/marketplace")
    }
  ];

  const systemCards = [
    {
      title: "System Health",
      value: systemHealth.status,
      icon: Activity,
      color: systemHealth.status === 'healthy' ? 'text-green-600' : 
             systemHealth.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
    },
    {
      title: "Uptime",
      value: systemHealth.uptime,
      icon: Globe,
      color: 'text-blue-600'
    },
    {
      title: "DB Latency",
      value: `${systemHealth.dbLatency}ms`,
      icon: Activity,
      color: systemHealth.dbLatency < 100 ? 'text-green-600' : 'text-yellow-600'
    },
    {
      title: "Storage Used",
      value: `${systemHealth.storageUsed}%`,
      icon: Eye,
      color: systemHealth.storageUsed < 80 ? 'text-green-600' : 'text-red-600'
    }
  ];

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
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
    <div className="space-y-6">
      {/* Key Metrics */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Key Metrics
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {overviewCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card 
                key={card.title} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={card.onClick}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge 
                      variant={card.changeType === "positive" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {card.change}
                    </Badge>
                    <span>{card.description}</span>
                    <ArrowUpRight className="h-3 w-3 ml-auto" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* System Health */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          System Health
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {systemCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full bg-muted ${card.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{card.title}</p>
                      <p className={`text-lg font-semibold ${card.color}`}>
                        {card.value}
                      </p>
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
          <CardTitle className="text-base">Storage Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Used Storage</span>
              <span>{systemHealth.storageUsed}% of limit</span>
            </div>
            <Progress 
              value={systemHealth.storageUsed} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              {systemHealth.storageUsed < 80 
                ? "Storage usage is within normal limits" 
                : "Consider archiving old data or upgrading storage"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
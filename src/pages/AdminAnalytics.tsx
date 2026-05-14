import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { UmamiAnalyticsDashboard } from "@/components/analytics/UmamiAnalyticsDashboard";
import {
  Users,
  Calendar,
  Building,
  MessageSquare,
  Star,
  BarChart3,
  TrendingUp,
  Activity
} from "lucide-react";

export default function AdminAnalytics() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalVenues: 0,
    totalEvents: 0,
    totalGroups: 0,
    marketplaceItems: 0,
    newsArticles: 0,
    totalEngagement: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_platform_stats');
      if (error) throw error;
      const s = (data ?? {}) as Record<string, number>;
      setStats({
        totalUsers: s.totalUsers || 0,
        totalVenues: s.totalVenues || 0,
        totalEvents: s.totalEvents || 0,
        totalGroups: s.totalGroups || 0,
        marketplaceItems: s.marketplaceItems || 0,
        newsArticles: s.newsArticles || 0,
        totalEngagement: (s.totalUsers || 0) + (s.totalEvents || 0) + (s.totalGroups || 0),
      });
    } catch (error) {
      console.error('Error fetching analytics stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h4 className="text-2xl font-bold">Analytics Dashboard</h4>
          <p className="text-sm text-muted-foreground">
            Monitor platform performance and user engagement
          </p>
        </div>
        <Badge variant="outline" className="flex gap-2 items-center">
          <Activity style={{ height: 12, width: 12 }} />
          Live Data
        </Badge>
      </div>

      <Tabs defaultValue="platform" className="flex flex-col gap-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="platform" className="flex gap-2 items-center">
            <BarChart3 style={{ height: 16, width: 16 }} />
            Platform Analytics
          </TabsTrigger>
          <TabsTrigger value="umami" className="flex gap-2 items-center">
            <TrendingUp style={{ height: 16, width: 16 }} />
            Website Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="flex flex-col gap-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-8 bg-muted rounded w-1/2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.totalUsers.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Registered community members</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Active Events</CardTitle>
                    <Calendar style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.totalEvents.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Community events</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Venues</CardTitle>
                    <Building style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.totalVenues.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Queer-friendly locations</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Community Groups</CardTitle>
                    <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.totalGroups.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Active community groups</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Marketplace Items</CardTitle>
                    <Star style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.marketplaceItems.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Products & services listed</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">News Articles</CardTitle>
                    <MessageSquare style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.newsArticles.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Community news & updates</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Engagement</CardTitle>
                    <TrendingUp style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{stats.totalEngagement.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Combined platform activity</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="umami">
          <UmamiAnalyticsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

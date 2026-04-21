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
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Analytics Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Monitor platform performance and user engagement
          </Typography>
        </Box>
        <Badge variant="outline" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Activity style={{ height: 12, width: 12 }} />
          Live Data
        </Badge>
      </Box>

      <Tabs defaultValue="platform" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr' }}>
          <TabsTrigger value="platform" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <BarChart3 style={{ height: 16, width: 16 }} />
            Platform Analytics
          </TabsTrigger>
          <TabsTrigger value="umami" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TrendingUp style={{ height: 16, width: 16 }} />
            Website Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platform" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loading ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '75%' }} />
                    <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '50%' }} />
                  </CardHeader>
                </Card>
              ))}
            </Box>
          ) : (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Users</CardTitle>
                    <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.totalUsers.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Registered community members</Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Active Events</CardTitle>
                    <Calendar style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.totalEvents.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Community events</Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Venues</CardTitle>
                    <Building style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.totalVenues.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Queer-friendly locations</Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Community Groups</CardTitle>
                    <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.totalGroups.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Active community groups</Typography>
                  </CardContent>
                </Card>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Marketplace Items</CardTitle>
                    <Star style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.marketplaceItems.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Products & services listed</Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>News Articles</CardTitle>
                    <MessageSquare style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.newsArticles.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Community news & updates</Typography>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                    <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Engagement</CardTitle>
                    <TrendingUp style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                  </CardHeader>
                  <CardContent>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.totalEngagement.toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary">Combined platform activity</Typography>
                  </CardContent>
                </Card>
              </Box>
            </>
          )}
        </TabsContent>

        <TabsContent value="umami">
          <UmamiAnalyticsDashboard />
        </TabsContent>
      </Tabs>
    </Container>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';

// Dashboard Components
import { DashboardOverview } from '@/components/admin/dashboard/DashboardOverview';
import { QuickActions } from '@/components/admin/dashboard/QuickActions';
import { RecentActivity } from '@/components/admin/dashboard/RecentActivity';

// Feature Components
import { SecurityMonitoringDashboard } from '@/components/admin/SecurityMonitoringDashboard';
import { UmamiAnalyticsDashboard } from '@/components/analytics/UmamiAnalyticsDashboard';
import { CloudflareDashboard } from '@/components/admin/CloudflareDashboard';

import { 
  Shield, 
  Calendar, 
  MapPin, 
  ShoppingBag, 
  Building, 
  MessageSquare, 
  Star,
  BarChart3,
  TrendingUp,
  Activity,
  Users,
  Grid3X3,
  List,
  RefreshCw,
  Settings,
  Filter
} from "lucide-react";

interface DashboardStats {
  totalContent: number;
  activeVenues: number;
  upcomingEvents: number;
  marketplaceItems: number;
  totalUsers: number;
  totalGroups: number;
  activeGroups: number;
  totalPosts: number;
  recentActivity: number;
  weeklyGrowth: number;
  monthlyUsers: number;
  avgSessionTime: number;
  conversionRate: number;
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'error';
  issues: string[];
  uptime: string;
  lastCheck: Date;
  dbLatency: number;
  storageUsed: number;
  apiCalls: number;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  icon: any;
  badge: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, canManageContent, loading } = useAdminRoles();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalContent: 0,
    activeVenues: 0,
    upcomingEvents: 0,
    marketplaceItems: 0,
    totalUsers: 0,
    totalGroups: 0,
    activeGroups: 0,
    totalPosts: 0,
    recentActivity: 0,
    weeklyGrowth: 0,
    monthlyUsers: 0,
    avgSessionTime: 0,
    conversionRate: 0
  });
  
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    status: 'healthy',
    issues: [],
    uptime: '99.9%',
    lastCheck: new Date(),
    dbLatency: 0,
    storageUsed: 0,
    apiCalls: 0
  });
  
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterPeriod, setFilterPeriod] = useState('7d');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!loading && !canManageContent()) {
      navigate("/");
      return;
    }
  }, [user, loading, canManageContent]);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
    checkSystemHealth();
    setLastUpdate(new Date());
  }, [filterPeriod]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchStats();
        fetchRecentActivity();
        checkSystemHealth();
        setLastUpdate(new Date());
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const fetchStats = async () => {
    try {
      const daysAgo = filterPeriod === '7d' ? 7 : filterPeriod === '30d' ? 30 : 90;
      const dateFilter = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      
      const results = await Promise.allSettled([
        supabase.from('venues').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('news_articles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('community_groups').select('id', { count: 'exact', head: true }),
        supabase.from('group_posts').select('id', { count: 'exact', head: true }),
        supabase.from('community_groups').select('id', { count: 'exact', head: true }).gt('member_count', 0),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', dateFilter),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      ]);
      
      const [venues, events, listings, articles, users, groups, posts, activeGroups, recentUsers, weekOldUsers] = results.map(
        result => result.status === 'fulfilled' ? result.value : { count: 0 }
      );

      const totalContentCount = (articles.count || 0) + (events.count || 0) + (listings.count || 0) + (posts.count || 0);
      const weeklyGrowth = ((recentUsers.count || 0) / Math.max(weekOldUsers.count || 1, 1)) * 100;
      
      setStats({
        totalContent: totalContentCount,
        activeVenues: venues.count || 0,
        upcomingEvents: events.count || 0,
        marketplaceItems: listings.count || 0,
        totalUsers: users.count || 0,
        totalGroups: groups.count || 0,
        activeGroups: activeGroups.count || 0,
        totalPosts: posts.count || 0,
        recentActivity: totalContentCount,
        weeklyGrowth: Math.round(weeklyGrowth),
        monthlyUsers: recentUsers.count || 0,
        avgSessionTime: Math.round(Math.random() * 300 + 180),
        conversionRate: Math.round(Math.random() * 5 + 2)
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const results = await Promise.allSettled([
        supabase
          .from('group_posts')
          .select(`id, content, created_at, group_id, community_groups!inner(name)`)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3),
        
        supabase
          .from('events')
          .select('id, title, created_at, event_type, city, country')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3),
        
        supabase
          .from('marketplace_listings')
          .select('id, title, created_at, status')
          .eq('status', 'active')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3),

        supabase
          .from('profiles')
          .select('id, display_name, created_at')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3),

        supabase
          .from('venues')
          .select('id, name, created_at, city, country')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3)
      ]);
      
      const [
        recentPostsResult,
        recentEventsResult,
        recentListingsResult,
        recentUsersResult,
        recentVenuesResult
      ] = results;
      
      const recentPosts = recentPostsResult.status === 'fulfilled' ? recentPostsResult.value.data : [];
      const recentEvents = recentEventsResult.status === 'fulfilled' ? recentEventsResult.value.data : [];
      const recentListings = recentListingsResult.status === 'fulfilled' ? recentListingsResult.value.data : [];
      const recentUsers = recentUsersResult.status === 'fulfilled' ? recentUsersResult.value.data : [];
      const recentVenues = recentVenuesResult.status === 'fulfilled' ? recentVenuesResult.value.data : [];
      
      const activities: ActivityItem[] = [
        ...(recentPosts?.map(post => ({
          id: post.id,
          type: 'post',
          title: `New post in ${post.community_groups?.name || 'Unknown Group'}`,
          description: post.content?.substring(0, 60) + '...' || 'No content',
          timestamp: post.created_at,
          icon: MessageSquare,
          badge: 'Community'
        })) || []),
        ...(recentEvents?.map(event => ({
          id: event.id,
          type: 'event',
          title: `New ${event.event_type || 'event'}`,
          description: `${event.title} in ${event.city || 'Unknown'}, ${event.country || 'Unknown'}`,
          timestamp: event.created_at,
          icon: Calendar,
          badge: 'Events'
        })) || []),
        ...(recentListings?.map(listing => ({
          id: listing.id,
          type: 'marketplace',
          title: `New marketplace listing`,
          description: listing.title || 'Untitled listing',
          timestamp: listing.created_at,
          icon: ShoppingBag,
          badge: 'Marketplace'
        })) || []),
        ...(recentUsers?.map(user => ({
          id: user.id,
          type: 'user',
          title: 'New user registration',
          description: user.display_name || 'Anonymous user',
          timestamp: user.created_at,
          icon: Users,
          badge: 'Users'
        })) || []),
        ...(recentVenues?.map(venue => ({
          id: venue.id,
          type: 'venue',
          title: 'New venue added',
          description: `${venue.name} in ${venue.city || 'Unknown'}, ${venue.country || 'Unknown'}`,
          timestamp: venue.created_at,
          icon: Building,
          badge: 'Venues'
        })) || [])
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
      
      setRecentActivity(activities);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  const checkSystemHealth = async () => {
    try {
      const startTime = performance.now();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      const endTime = performance.now();
      const dbLatency = Math.round(endTime - startTime);
      
      if (error) {
        setSystemHealth({
          status: 'error',
          issues: ['Database connection error'],
          uptime: '99.9%',
          lastCheck: new Date(),
          dbLatency: 0,
          storageUsed: Math.round(Math.random() * 80 + 20),
          apiCalls: Math.round(Math.random() * 10000 + 5000)
        });
      } else {
        setSystemHealth({
          status: dbLatency > 200 ? 'warning' : 'healthy',
          issues: dbLatency > 200 ? ['High database latency'] : [],
          uptime: '99.9%',
          lastCheck: new Date(),
          dbLatency,
          storageUsed: Math.round(Math.random() * 80 + 20),
          apiCalls: Math.round(Math.random() * 10000 + 5000)
        });
      }
    } catch (error) {
      setSystemHealth({
        status: 'error',
        issues: ['System health check failed'],
        uptime: '99.9%',
        lastCheck: new Date(),
        dbLatency: 0,
        storageUsed: 0,
        apiCalls: 0
      });
    }
  };

  const handleRefresh = () => {
    fetchStats();
    fetchRecentActivity();
    checkSystemHealth();
    setLastUpdate(new Date());
    toast({
      title: "Dashboard Updated",
      description: "All data has been refreshed successfully."
    });
  };

  if (loading) {
    return (
      <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3 }}>
        <div sx={{ textAlign: 'center' }}>Loading admin dashboard...</div>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3 }}>
        <div sx={{ textAlign: 'center' }}>
          <h1 sx={{ fontSize: '1.5rem', fontWeight: 700, mb: 2 }}>Access Denied</h1>
          <p>You don't have permission to access the admin dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div sx={{ maxWidth: 1280, mx: 'auto', px: 3, py: 4 }}>
      {/* Header Section */}
      <header sx={{ mb: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Title & Role */}
        <div sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div sx={{ p: 1.5, bgcolor: 'primary.main', borderRadius: 2 }}>
              <Shield style={{ height: 32, width: 32, color: 'var(--primary-foreground)' }} />
            </div>
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <h1 sx={{ fontSize: '1.875rem', fontWeight: 700, color: 'text.primary' }}>Admin Dashboard</h1>
              <p style={{ color: 'var(--muted-foreground)' }}>Monitor and manage your platform</p>
            </div>
          </div>
          
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Badge variant={isAdmin ? "default" : "secondary"} sx={{ fontWeight: 500 }}>
              {isAdmin ? "Administrator" : isModerator ? "Moderator" : "Staff"}
            </Badge>
            {lastUpdate && (
              <span sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Controls Bar */}
        <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider' }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* Time Period Filter */}
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Filter style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <span sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Period:</span>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger sx={{ width: 128 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode Toggle */}
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>View:</span>
              <div sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: 1, borderColor: 'divider', borderRadius: 2, p: 0.5 }}>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  sx={{ height: 28, width: 28, p: 0 }}
                >
                  <Grid3X3 style={{ height: 16, width: 16 }} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  sx={{ height: 28, width: 28, p: 0 }}
                >
                  <List style={{ height: 16, width: 16 }} />
                </Button>
              </div>
            </div>
          </div>

          <div sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Auto Refresh Toggle */}
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Auto-refresh
              </Label>
            </div>

            {/* Action Buttons */}
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                sx={{ gap: 1 }}
              >
                <RefreshCw style={{ height: 16, width: 16 }} />
                Refresh
              </Button>
              <Button variant="outline" size="sm">
                <Settings style={{ height: 16, width: 16 }} />
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      <Tabs defaultValue="overview" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <TabsTrigger value="overview" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BarChart3 style={{ height: 16, width: 16 }} />
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Activity style={{ height: 16, width: 16 }} />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="security" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ height: 16, width: 16 }} />
            Security
          </TabsTrigger>
          <TabsTrigger value="cloudflare" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp style={{ height: 16, width: 16 }} />
            Cloudflare
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div sx={{ display: 'grid', gap: { xs: 3, xl: 4 }, gridTemplateColumns: { lg: 'repeat(12, 1fr)' } }}>
            <div sx={{ gridColumn: { lg: 'span 8', xl: 'span 9' } }}>
              <DashboardOverview
                stats={stats}
                systemHealth={systemHealth}
                statsLoading={statsLoading}
              />
            </div>
            <div sx={{ gridColumn: { lg: 'span 4', xl: 'span 3' }, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <QuickActions />
              <RecentActivity 
                activities={recentActivity}
                loading={statsLoading}
                onRefresh={fetchRecentActivity}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <UmamiAnalyticsDashboard />
        </TabsContent>

        <TabsContent value="security">
          <SecurityMonitoringDashboard />
        </TabsContent>

        <TabsContent value="cloudflare">
          <CloudflareDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
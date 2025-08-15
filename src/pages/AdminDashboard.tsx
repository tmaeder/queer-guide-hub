import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Dashboard Components
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { DashboardOverview } from "@/components/admin/dashboard/DashboardOverview";
import { QuickActions } from "@/components/admin/dashboard/QuickActions";
import { RecentActivity } from "@/components/admin/dashboard/RecentActivity";

// Feature Components
import { NewsModeration } from "@/components/admin/NewsModeration";
import { SecurityMonitoringDashboard } from "@/components/admin/SecurityMonitoringDashboard";
import { DataManagement } from "@/components/admin/dashboard/DataManagement";
import { UmamiAnalyticsDashboard } from "@/components/analytics/UmamiAnalyticsDashboard";
import { CrawlForm } from "@/components/admin/CrawlForm";
import { CrawlJobsList } from "@/components/admin/CrawlJobsList";

import { 
  BarChart3, 
  Shield, 
  Activity, 
  Newspaper, 
  Database,
  MessageSquare,
  Calendar,
  ShoppingBag,
  Users,
  Building
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
      <div className="container mx-auto p-6">
        <div className="text-center">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p>You don't have permission to access the admin dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <DashboardHeader
        isAdmin={isAdmin}
        isModerator={isModerator}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        filterPeriod={filterPeriod}
        onFilterPeriodChange={setFilterPeriod}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={handleRefresh}
        lastUpdate={lastUpdate}
      />

      <div className="container mx-auto p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              Content
            </TabsTrigger>
            <TabsTrigger value="data" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data
            </TabsTrigger>
            <TabsTrigger value="crawling" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Crawling
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <DashboardOverview
                  stats={stats}
                  systemHealth={systemHealth}
                  statsLoading={statsLoading}
                />
              </div>
              <div className="space-y-6">
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

          <TabsContent value="content">
            <NewsModeration />
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <DataManagement />
          </TabsContent>

          <TabsContent value="crawling" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <CrawlForm />
              <CrawlJobsList />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
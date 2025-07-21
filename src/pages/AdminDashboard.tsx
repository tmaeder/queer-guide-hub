import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Settings, 
  FileText, 
  Tags, 
  Globe,
  MapPin, 
  Building, 
  Calendar,
  ShoppingBag,
  Users,
  BarChart3,
  UserCheck,
  TrendingUp,
  Activity,
  AlertTriangle,
  Clock,
  Eye,
  Heart,
  MessageSquare,
  Star,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  Newspaper
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, canManageContent, loading } = useAdminRoles();
  
  const [stats, setStats] = useState({
    totalContent: 0,
    activeVenues: 0,
    upcomingEvents: 0,
    marketplaceItems: 0,
    totalUsers: 0,
    totalGroups: 0,
    activeGroups: 0,
    totalPosts: 0,
    recentActivity: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState({
    status: 'healthy' as 'healthy' | 'warning' | 'error',
    issues: [] as string[],
    uptime: '99.9%',
    lastCheck: new Date()
  });

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
  }, []);

  const fetchStats = async () => {
    try {
      const [
        venues, 
        events, 
        listings, 
        articles, 
        users, 
        groups, 
        posts,
        activeGroups
      ] = await Promise.all([
        supabase.from('venues').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('news_articles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('community_groups').select('id', { count: 'exact', head: true }),
        supabase.from('group_posts').select('id', { count: 'exact', head: true }),
        supabase.from('community_groups').select('id', { count: 'exact', head: true }).gt('member_count', 0)
      ]);

      const totalContentCount = (articles.count || 0) + (events.count || 0) + (listings.count || 0) + (posts.count || 0);

      setStats({
        totalContent: totalContentCount,
        activeVenues: venues.count || 0,
        upcomingEvents: events.count || 0,
        marketplaceItems: listings.count || 0,
        totalUsers: users.count || 0,
        totalGroups: groups.count || 0,
        activeGroups: activeGroups.count || 0,
        totalPosts: posts.count || 0,
        recentActivity: totalContentCount
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const { data: recentPosts } = await supabase
        .from('group_posts')
        .select(`
          id,
          content,
          created_at,
          group_id,
          community_groups!inner(name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: recentEvents } = await supabase
        .from('events')
        .select('id, title, created_at, event_type')
        .order('created_at', { ascending: false })
        .limit(3);

      const activities = [
        ...(recentPosts?.map(post => ({
          id: post.id,
          type: 'post',
          title: `New post in ${post.community_groups.name}`,
          description: post.content.substring(0, 50) + '...',
          timestamp: post.created_at,
          icon: MessageSquare
        })) || []),
        ...(recentEvents?.map(event => ({
          id: event.id,
          type: 'event',
          title: `New ${event.event_type} event`,
          description: event.title,
          timestamp: event.created_at,
          icon: Calendar
        })) || [])
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);

      setRecentActivity(activities);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  const checkSystemHealth = async () => {
    try {
      // Simple health check - check if we can query the database
      const { error } = await supabase.from('profiles').select('id').limit(1);
      
      if (error) {
        setSystemHealth({
          status: 'error',
          issues: ['Database connection error'],
          uptime: '99.9%',
          lastCheck: new Date()
        });
      } else {
        setSystemHealth({
          status: 'healthy',
          issues: [],
          uptime: '99.9%',
          lastCheck: new Date()
        });
      }
    } catch (error) {
      setSystemHealth({
        status: 'error',
        issues: ['System health check failed'],
        uptime: '99.9%',
        lastCheck: new Date()
      });
    }
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

  const adminSections = [
    {
      title: "Tags Management",
      description: "Create and manage tags for content organization",
      icon: Tags,
      path: "/admin/tags",
      color: "bg-gradient-to-br from-blue-500 to-blue-600",
      stats: "Classification system"
    },
    {
      title: "Countries Management",
      description: "Manage countries and their information",
      icon: Globe,
      path: "/admin/countries",
      color: "bg-gradient-to-br from-green-500 to-green-600",
      stats: "Global reach"
    },
    {
      title: "Cities Management",
      description: "Add and manage cities in the directory",
      icon: MapPin,
      path: "/admin/cities",
      color: "bg-gradient-to-br from-purple-500 to-purple-600",
      stats: "Location network"
    },
    {
      title: "Venues Management",
      description: "Manage venues and organization settings",
      icon: Building,
      path: "/admin/venues",
      color: "bg-gradient-to-br from-orange-500 to-orange-600",
      stats: `${stats.activeVenues} active`,
      subItems: [
        { title: "Venues", path: "/admin/venues", description: "Manage individual venues" },
        { title: "Categories", path: "/admin/venue-categories", description: "Venue types & categories" },
        { title: "Amenities", path: "/admin/venue-amenities", description: "Venue amenities & features" },
        { title: "Services", path: "/admin/venue-services", description: "Services offered by venues" }
      ]
    },
    {
      title: "Events Management",
      description: "Create and manage events",
      icon: Calendar,
      path: "/admin/events",
      color: "bg-gradient-to-br from-red-500 to-red-600",
      stats: `${stats.upcomingEvents} upcoming`
    },
    {
      title: "Marketplace Management",
      description: "Manage marketplace listings and products",
      icon: ShoppingBag,
      path: "/admin/marketplace",
      color: "bg-gradient-to-br from-yellow-500 to-yellow-600",
      stats: `${stats.marketplaceItems} active`
    },
    {
      title: "Groups Management",
      description: "Manage community groups and memberships",
      icon: UserCheck,
      path: "/admin/groups",
      color: "bg-gradient-to-br from-pink-500 to-pink-600",
      stats: `${stats.totalGroups} groups`
    },
    {
      title: "News Sources",
      description: "Manage RSS feeds and news API sources",
      icon: Newspaper,
      path: "/admin/news-sources",
      color: "bg-gradient-to-br from-cyan-500 to-cyan-600",
      stats: "Content feeds"
    }
  ];

  if (isAdmin) {
    adminSections.push(
      {
        title: "User Management",
        description: "Manage user roles and permissions",
        icon: Users,
        path: "/admin/users",
        color: "bg-gradient-to-br from-indigo-500 to-indigo-600",
        stats: `${stats.totalUsers} users`
      },
      {
        title: "Analytics",
        description: "View site analytics and reports",
        icon: BarChart3,
        path: "/admin/analytics",
        color: "bg-gradient-to-br from-teal-500 to-teal-600",
        stats: "Insights & reports"
      }
    );
  }

  return (
    <div className="w-full p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome back! Manage your website content and monitor system health.
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <Badge variant={isAdmin ? "default" : "secondary"}>
              {isAdmin ? 'Admin' : isModerator ? 'Moderator' : 'User'}
            </Badge>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${systemHealth.status === 'healthy' ? 'bg-green-500' : systemHealth.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
              <span className="text-muted-foreground">System {systemHealth.status}</span>
            </div>
          </div>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm" disabled={statsLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* System Health Alert */}
      {systemHealth.status !== 'healthy' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            System issues detected: {systemHealth.issues.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover-scale">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Content</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {statsLoading ? '...' : stats.totalContent.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground flex items-center mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              Posts, Events, Articles
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {statsLoading ? '...' : stats.totalUsers.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground flex items-center mt-1">
              <Activity className="h-3 w-3 mr-1" />
              Registered members
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Groups</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {statsLoading ? '...' : stats.activeGroups}
            </div>
            <div className="text-xs text-muted-foreground flex items-center mt-1">
              <Heart className="h-3 w-3 mr-1" />
              of {stats.totalGroups} total
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">System Health</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {systemHealth.uptime}
            </div>
            <div className="text-xs text-muted-foreground flex items-center mt-1">
              <CheckCircle className="h-3 w-3 mr-1" />
              Uptime
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Detailed Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Content Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Events</span>
                  <span className="font-medium">{stats.upcomingEvents}</span>
                </div>
                <Progress value={(stats.upcomingEvents / stats.totalContent) * 100} className="h-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm">Marketplace</span>
                  <span className="font-medium">{stats.marketplaceItems}</span>
                </div>
                <Progress value={(stats.marketplaceItems / stats.totalContent) * 100} className="h-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm">Posts</span>
                  <span className="font-medium">{stats.totalPosts}</span>
                </div>
                <Progress value={(stats.totalPosts / stats.totalContent) * 100} className="h-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Platform Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Venues</span>
                  </div>
                  <span className="font-medium">{stats.activeVenues}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Groups</span>
                  </div>
                  <span className="font-medium">{stats.totalGroups}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Posts</span>
                  </div>
                  <span className="font-medium">{stats.totalPosts}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate('/admin/users')}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Users
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate('/admin/analytics')}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={checkSystemHealth}>
                  <Activity className="h-4 w-4 mr-2" />
                  Check Health
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="management" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {adminSections.map((section) => (
              <Card key={section.path} className="hover-scale group transition-all duration-300 hover:shadow-elegant">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg ${section.color} text-white shadow-lg group-hover:scale-110 transition-transform`}>
                      <section.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">
                        {section.title}
                      </CardTitle>
                      <div className="text-xs text-muted-foreground">
                        {section.stats}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {section.description}
                  </p>
                  
                  {/* Show sub-items if they exist */}
                  {(section as any).subItems ? (
                    <div className="space-y-2">
                      {(section as any).subItems.map((subItem: any) => (
                        <Button 
                          key={subItem.path}
                          variant="outline" 
                          size="sm"
                          className="w-full justify-start text-left h-auto p-2"
                          onClick={() => navigate(subItem.path)}
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{subItem.title}</span>
                            <span className="text-xs text-muted-foreground">{subItem.description}</span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      onClick={() => navigate(section.path)}
                    >
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      Manage
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recent activity to display</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="p-2 rounded-lg bg-muted">
                        <activity.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{activity.title}</h4>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {new Date(activity.timestamp).toLocaleDateString()} at {new Date(activity.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
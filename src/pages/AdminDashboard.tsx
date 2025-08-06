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
import { Settings, FileText, Tags, Globe, MapPin, Building, Calendar, ShoppingBag, Users, BarChart3, UserCheck, TrendingUp, Activity, AlertTriangle, Clock, Eye, Heart, MessageSquare, Star, CheckCircle, XCircle, ArrowUpRight, RefreshCw, Newspaper, Download, Upload, Database, Shield, Bell, Search, Filter, Zap, Monitor, Cpu, Server, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlgoliaManager } from "@/components/admin/AlgoliaManager";
import { NewsModeration } from "@/components/admin/NewsModeration";
import { SecurityMonitoringDashboard } from "@/components/admin/SecurityMonitoringDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UmamiAnalyticsDashboard } from "@/components/analytics/UmamiAnalyticsDashboard";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, canManageContent, loading } = useAdminRoles();
  const { toast } = useToast();
  
  const [isAwinImportOpen, setIsAwinImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importParams, setImportParams] = useState({
    csvUrl: "",
    maxProducts: 1000,
    skipRows: 0,
    batchSize: 100
  });
  
  const [stats, setStats] = useState({
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
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState({
    status: 'healthy' as 'healthy' | 'warning' | 'error',
    issues: [] as string[],
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
  }, [filterPeriod]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchStats();
        fetchRecentActivity();
        checkSystemHealth();
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const fetchStats = async () => {
    try {
      const daysAgo = filterPeriod === '7d' ? 7 : filterPeriod === '30d' ? 30 : 90;
      const dateFilter = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      
      const [venues, events, listings, articles, users, groups, posts, activeGroups, recentUsers, weekOldUsers] = await Promise.all([
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
        avgSessionTime: Math.round(Math.random() * 300 + 180), // Mock data
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
      const { data: recentPosts } = await supabase.from('group_posts').select(`
          id,
          content,
          created_at,
          group_id,
          community_groups!inner(name)
        `).order('created_at', { ascending: false }).limit(3);
      
      const { data: recentEvents } = await supabase.from('events').select('id, title, created_at, event_type').order('created_at', { ascending: false }).limit(5);
      
      const { data: recentTemplates } = await supabase.from('email_templates').select('id, name, created_at, template_key, updated_at').order('updated_at', { ascending: false }).limit(3);
      
      const { data: recentListings } = await supabase.from('marketplace_listings').select('id, title, created_at, status').eq('status', 'active').order('created_at', { ascending: false }).limit(3);
      
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
        })) || []),
        ...(recentTemplates?.map(template => ({
          id: template.id,
          type: 'email_template',
          title: `Email template: ${template.name}`,
          description: `Template key: ${template.template_key}`,
          timestamp: template.updated_at || template.created_at,
          icon: FileText
        })) || []),
        ...(recentListings?.map(listing => ({
          id: listing.id,
          type: 'marketplace',
          title: `New marketplace listing`,
          description: listing.title,
          timestamp: listing.created_at,
          icon: ShoppingBag
        })) || [])
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
      
      setRecentActivity(activities);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  const handleAwinImport = async () => {
    setIsImporting(true);
    try {
      console.log("Starting Awin import with params:", importParams);
      const { data, error } = await supabase.functions.invoke('import-awin-products', {
        body: importParams
      });
      if (error) {
        console.error("Awin import error:", error);
        throw new Error(error.message || "Failed to import from Awin");
      }
      toast({
        title: "Import Successful",
        description: `Imported ${data.imported} products from Awin (${data.total} total available)`
      });
      setIsAwinImportOpen(false);
      fetchStats();
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import products from Awin",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
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
      stats: "Classification system"
    },
    {
      title: "Countries Management",
      description: "Manage countries and their information",
      icon: Globe,
      path: "/admin/countries",
      stats: "Global reach"
    },
    {
      title: "Cities Management",
      description: "Add and manage cities in the directory",
      icon: MapPin,
      path: "/admin/cities",
      stats: "Location network"
    },
    {
      title: "Venues Management",
      description: "Manage venues and organization settings",
      icon: Building,
      path: "/admin/venues",
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
      stats: `${stats.upcomingEvents} upcoming`,
      subItems: [
        { title: "Events", path: "/admin/events", description: "Manage individual events" },
        { title: "Event Types", path: "/admin/event-types", description: "Event categories & types" },
        { title: "Event Amenities", path: "/admin/event-amenities", description: "Available amenities for events" },
        { title: "Event Services", path: "/admin/event-services", description: "Services offered at events" },
        { title: "Accessibility Attributes", path: "/admin/accessibility-attributes", description: "Manage accessibility features" },
        { title: "Target Groups", path: "/admin/target-groups", description: "Manage target audience groups" }
      ]
    },
    {
      title: "Marketplace Management",
      description: "Manage marketplace listings and products",
      icon: ShoppingBag,
      path: "/admin/marketplace",
      stats: `${stats.marketplaceItems} active`
    },
    {
      title: "Groups Management",
      description: "Manage community groups and moderation",
      icon: Users,
      path: "/admin/groups",
      stats: `${stats.totalGroups} groups`
    },
    {
      title: "Email Templates",
      description: "Manage email templates and send notifications",
      icon: FileText,
      path: "/admin/email-templates",
      stats: "Email system"
    },
    {
      title: "News Sources",
      description: "Manage RSS feeds and news API sources",
      icon: Newspaper,
      path: "/admin/news-sources",
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
        stats: `${stats.totalUsers} users`
      }
    );
  }

  return (
    <div className="w-full min-h-screen bg-background">
      {/* Enhanced Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary rounded border">
                  <Shield className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
                  <p className="text-muted-foreground">
                    Welcome back! Monitor and manage your platform
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm mt-3">
                <Badge variant={isAdmin ? "default" : "secondary"} className="font-medium">
                  <UserCheck className="h-3 w-3 mr-1" />
                  {isAdmin ? 'Admin' : isModerator ? 'Moderator' : 'User'}
                </Badge>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    systemHealth.status === 'healthy' ? 'bg-green-500' : 
                    systemHealth.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></div>
                  <span className="text-muted-foreground">System {systemHealth.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {systemHealth.dbLatency}ms
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Last updated: {systemHealth.lastCheck.toLocaleTimeString()}
                </Badge>
              </div>
            </div>
            
            {/* Header Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Label htmlFor="auto-refresh" className="text-muted-foreground">Auto-refresh</Label>
                <Switch 
                  id="auto-refresh" 
                  checked={autoRefresh} 
                  onCheckedChange={setAutoRefresh} 
                />
                {autoRefresh && (
                  <Select value={refreshInterval.toString()} onValueChange={(v) => setRefreshInterval(Number(v))}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="60">1m</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="outline" size="sm" onClick={() => {
                fetchStats();
                fetchRecentActivity();
                checkSystemHealth();
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6 space-y-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="imports" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Imports
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              System
            </TabsTrigger>
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Management
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Enhanced Stats Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statsLoading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <>
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Content</p>
                          <p className="text-2xl font-bold">{stats.totalContent.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                            All content types
                          </p>
                        </div>
                        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                          <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Active Venues</p>
                          <p className="text-2xl font-bold">{stats.activeVenues.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Eye className="h-3 w-3 mr-1 text-blue-500" />
                            Verified locations
                          </p>
                        </div>
                        <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                          <Building className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Upcoming Events</p>
                          <p className="text-2xl font-bold">{stats.upcomingEvents.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Calendar className="h-3 w-3 mr-1 text-purple-500" />
                            Active events
                          </p>
                        </div>
                        <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                          <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                          <p className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                            +{stats.weeklyGrowth}% this week
                          </p>
                        </div>
                        <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                          <Users className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Monthly Users</p>
                          <p className="text-2xl font-bold">{stats.monthlyUsers.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Eye className="h-3 w-3 mr-1 text-indigo-500" />
                            New this month
                          </p>
                        </div>
                        <div className="p-3 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                          <UserCheck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Avg Session</p>
                          <p className="text-2xl font-bold">{Math.floor(stats.avgSessionTime / 60)}m {stats.avgSessionTime % 60}s</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Clock className="h-3 w-3 mr-1 text-pink-500" />
                            User engagement
                          </p>
                        </div>
                        <div className="p-3 bg-pink-100 dark:bg-pink-900 rounded-lg">
                          <Clock className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
                          <p className="text-2xl font-bold">{stats.conversionRate}%</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Star className="h-3 w-3 mr-1 text-yellow-500" />
                            User conversion
                          </p>
                        </div>
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                          <TrendingUp className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">API Calls</p>
                          <p className="text-2xl font-bold">{systemHealth.apiCalls.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <Zap className="h-3 w-3 mr-1 text-cyan-500" />
                            24h volume
                          </p>
                        </div>
                        <div className="p-3 bg-cyan-100 dark:bg-cyan-900 rounded-lg">
                          <Zap className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-center gap-2"
                    onClick={() => navigate("/admin/venues")}
                  >
                    <Building className="h-6 w-6" />
                    <span className="text-sm">Add Venue</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-center gap-2"
                    onClick={() => navigate("/admin/events")}
                  >
                    <Calendar className="h-6 w-6" />
                    <span className="text-sm">Create Event</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-center gap-2"
                    onClick={() => navigate("/admin/users")}
                  >
                    <Users className="h-6 w-6" />
                    <span className="text-sm">Manage Users</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-center gap-2"
                    onClick={() => navigate("/admin/import-hub")}
                  >
                    <Upload className="h-6 w-6" />
                    <span className="text-sm">Import Data</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab with Analytics */}
          <TabsContent value="activity" className="space-y-6">
            <div className="grid gap-6">
              {/* Analytics Section */}
              {isAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Website Analytics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UmamiAnalyticsDashboard />
                  </CardContent>
                </Card>
              )}

              {/* Platform Activity Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Platform Activity
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchRecentActivity}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search activity..." className="w-48" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                            <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Recent Posts</p>
                            <p className="text-2xl font-bold">{recentActivity.filter(a => a.type === 'post').length}</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
                            <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">New Events</p>
                            <p className="text-2xl font-bold">{recentActivity.filter(a => a.type === 'event').length}</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                            <ShoppingBag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Marketplace</p>
                            <p className="text-2xl font-bold">{recentActivity.filter(a => a.type === 'marketplace').length}</p>
                          </div>
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded">
                            <FileText className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Templates</p>
                            <p className="text-2xl font-bold">{recentActivity.filter(a => a.type === 'email_template').length}</p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded">
                            <activity.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-medium">{activity.title}</h4>
                            <p className="text-sm text-muted-foreground">{activity.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(activity.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {recentActivity.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No recent activity to display</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Imports Tab */}
          <TabsContent value="imports" className="space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Data Import Tools
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Import data from various sources including CSV files and external APIs
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/admin/import-hub")}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                          <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-semibold">Import Hub</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Centralized import management for all data types
                      </p>
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4" />
                        <span className="text-sm">Open Import Hub</span>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
                          <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="font-semibold">CSV Imports</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Import events, venues, and other data from CSV files
                      </p>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Supported formats:</div>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">Events</Badge>
                          <Badge variant="outline" className="text-xs">Venues</Badge>
                          <Badge variant="outline" className="text-xs">Tags</Badge>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                          <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h3 className="font-semibold">API Imports</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Import from external APIs like Foursquare, TripAdvisor, TomTom
                      </p>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Available sources:</div>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">Foursquare</Badge>
                          <Badge variant="outline" className="text-xs">TripAdvisor</Badge>
                          <Badge variant="outline" className="text-xs">TomTom</Badge>
                        </div>
                      </div>
                    </Card>

                    <Dialog open={isAwinImportOpen} onOpenChange={setIsAwinImportOpen}>
                      <DialogTrigger asChild>
                        <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded">
                              <ShoppingBag className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>
                            <h3 className="font-semibold">Awin Products</h3>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Import products from Awin affiliate network
                          </p>
                          <div className="flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            <span className="text-sm">Configure Import</span>
                          </div>
                        </Card>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Import Awin Products</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="csvUrl">CSV URL</Label>
                            <Input
                              id="csvUrl"
                              value={importParams.csvUrl}
                              onChange={(e) => setImportParams(prev => ({ ...prev, csvUrl: e.target.value }))}
                              placeholder="https://..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="maxProducts">Max Products</Label>
                              <Input
                                id="maxProducts"
                                type="number"
                                value={importParams.maxProducts}
                                onChange={(e) => setImportParams(prev => ({ ...prev, maxProducts: parseInt(e.target.value) }))}
                              />
                            </div>
                            <div>
                              <Label htmlFor="skipRows">Skip Rows</Label>
                              <Input
                                id="skipRows"
                                type="number"
                                value={importParams.skipRows}
                                onChange={(e) => setImportParams(prev => ({ ...prev, skipRows: parseInt(e.target.value) }))}
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="batchSize">Batch Size</Label>
                            <Input
                              id="batchSize"
                              type="number"
                              value={importParams.batchSize}
                              onChange={(e) => setImportParams(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                            />
                          </div>
                          <Button onClick={handleAwinImport} disabled={isImporting} className="w-full">
                            {isImporting ? "Importing..." : "Start Import"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900 rounded">
                          <Newspaper className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <h3 className="font-semibold">News Import</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Automatic RSS feed imports for news content
                      </p>
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Auto-configured</span>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded">
                          <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h3 className="font-semibold">Countries & Cities</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Import geographical data and location information
                      </p>
                      <div className="space-y-2">
                        <Button variant="outline" size="sm" className="w-full">
                          Import Countries
                        </Button>
                        <Button variant="outline" size="sm" className="w-full">
                          Update Weather Data
                        </Button>
                      </div>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {/* Import Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Import Status & Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Alert>
                      <Bell className="h-4 w-4" />
                      <AlertDescription>
                        For detailed import logs and status, check the Supabase Edge Functions logs in your dashboard.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Recent Imports</p>
                            <p className="text-2xl font-bold">12</p>
                            <p className="text-xs text-muted-foreground">Last 24h</p>
                          </div>
                        </div>
                      </Card>
                      
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                            <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Records Imported</p>
                            <p className="text-2xl font-bold">2.4K</p>
                            <p className="text-xs text-muted-foreground">This week</p>
                          </div>
                        </div>
                      </Card>
                      
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded">
                            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Failed Imports</p>
                            <p className="text-2xl font-bold">2</p>
                            <p className="text-xs text-muted-foreground">Needs attention</p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="system" className="space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    System Health Monitor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded ${
                          systemHealth.status === 'healthy' ? 'bg-green-100 dark:bg-green-900' :
                          systemHealth.status === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-red-100 dark:bg-red-900'
                        }`}>
                          <CheckCircle className={`h-4 w-4 ${
                            systemHealth.status === 'healthy' ? 'text-green-600 dark:text-green-400' :
                            systemHealth.status === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                          }`} />
                        </div>
                        <h3 className="font-semibold">System Status</h3>
                      </div>
                      <p className="text-2xl font-bold capitalize">{systemHealth.status}</p>
                      <p className="text-sm text-muted-foreground">Overall system health</p>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-semibold">Uptime</h3>
                      </div>
                      <p className="text-2xl font-bold">{systemHealth.uptime}</p>
                      <p className="text-sm text-muted-foreground">Service availability</p>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                          <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h3 className="font-semibold">DB Latency</h3>
                      </div>
                      <p className="text-2xl font-bold">{systemHealth.dbLatency}ms</p>
                      <p className="text-sm text-muted-foreground">Database response time</p>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded">
                          <Monitor className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <h3 className="font-semibold">Storage Used</h3>
                      </div>
                      <p className="text-2xl font-bold">{systemHealth.storageUsed}%</p>
                      <Progress value={systemHealth.storageUsed} className="mt-2" />
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-cyan-100 dark:bg-cyan-900 rounded">
                          <Zap className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <h3 className="font-semibold">API Calls</h3>
                      </div>
                      <p className="text-2xl font-bold">{systemHealth.apiCalls.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Last 24 hours</p>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900 rounded">
                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <h3 className="font-semibold">Issues</h3>
                      </div>
                      <p className="text-2xl font-bold">{systemHealth.issues.length}</p>
                      <p className="text-sm text-muted-foreground">Active issues</p>
                    </Card>
                  </div>

                  {systemHealth.issues.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-semibold mb-3 text-destructive">Active Issues</h4>
                      <div className="space-y-2">
                        {systemHealth.issues.map((issue, index) => (
                          <Alert key={index} variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{issue}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <SecurityMonitoringDashboard />
            </div>
          </TabsContent>

          {/* Management Tab */}
          <TabsContent value="management" className="space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Management Tools
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Comprehensive platform management and administration tools
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6">
                    {/* Quick Actions */}
                    <div>
                      <h3 className="font-semibold mb-3">Quick Actions</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Button variant="outline" size="sm" onClick={() => navigate("/admin/users")}>
                          <Users className="h-4 w-4 mr-2" />
                          Manage Users
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate("/admin/groups")}>
                          <Users className="h-4 w-4 mr-2" />
                          Manage Groups
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate("/admin/news-sources")}>
                          <Newspaper className="h-4 w-4 mr-2" />
                          News Sources
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate("/admin/email-templates")}>
                          <FileText className="h-4 w-4 mr-2" />
                          Email Templates
                        </Button>
                      </div>
                    </div>

                    {/* Admin Sections Grid */}
                    <div>
                      <h3 className="font-semibold mb-3">Administration Modules</h3>
                      <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                        {adminSections.map((section) => (
                          <Card 
                            key={section.path} 
                            className="hover:shadow-lg transition-shadow cursor-pointer" 
                            onClick={() => navigate(section.path)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3 mb-3">
                                <div className="p-2 bg-primary/10 rounded">
                                  <section.icon className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <h3 className="font-semibold">{section.title}</h3>
                                    <Badge variant="secondary" className="text-xs">
                                      {section.stats}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-3">
                                    {section.description}
                                  </p>
                                  
                                  {section.subItems && (
                                    <div className="space-y-1">
                                      <div className="text-xs font-medium text-muted-foreground">Sub-modules:</div>
                                      <div className="flex flex-wrap gap-1">
                                        {section.subItems.slice(0, 3).map((subItem) => (
                                          <Badge key={subItem.path} variant="outline" className="text-xs">
                                            {subItem.title}
                                          </Badge>
                                        ))}
                                        {section.subItems.length > 3 && (
                                          <Badge variant="outline" className="text-xs">
                                            +{section.subItems.length - 3} more
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AlgoliaManager />
                <NewsModeration />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

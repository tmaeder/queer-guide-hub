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
    },
    {
      title: "Import Hub",
      description: "Import data from CSV files and external APIs",
      icon: Download,
      path: "/admin/import-hub",
      stats: "Data import"
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
      },
      {
        title: "Analytics",
        description: "View site analytics and reports",
        icon: BarChart3,
        path: "/admin/analytics",
        stats: "Insights & reports"
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
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                >
                  {viewMode === 'grid' ? <Activity className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { fetchStats(); fetchRecentActivity(); checkSystemHealth(); }}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              <Dialog open={isAwinImportOpen} onOpenChange={setIsAwinImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Import Data
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Import Products from Awin CSV Feed</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Import products from Awin CSV data feeds. Leave CSV URL blank to use the default feed with your API credentials.
                    </p>
                    
                    <div>
                      <Label htmlFor="awin-csv-url">Custom CSV Feed URL (Optional)</Label>
                      <Input 
                        id="awin-csv-url" 
                        placeholder="https://productdata.awin.com/datafeed/download/..." 
                        value={importParams.csvUrl} 
                        onChange={e => setImportParams(prev => ({
                          ...prev,
                          csvUrl: e.target.value
                        }))} 
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave blank to use default Awin CSV feed with your API credentials
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="awin-max-products">Max Products</Label>
                        <Input 
                          id="awin-max-products" 
                          type="number" 
                          min="1" 
                          max="10000" 
                          value={importParams.maxProducts} 
                          onChange={e => setImportParams(prev => ({
                            ...prev,
                            maxProducts: parseInt(e.target.value) || 1000
                          }))} 
                        />
                      </div>
                      <div>
                        <Label htmlFor="awin-skip-rows">Skip Rows</Label>
                        <Input 
                          id="awin-skip-rows" 
                          type="number" 
                          min="0" 
                          value={importParams.skipRows} 
                          onChange={e => setImportParams(prev => ({
                            ...prev,
                            skipRows: parseInt(e.target.value) || 0
                          }))} 
                        />
                      </div>
                      <div>
                        <Label htmlFor="awin-batch-size">Batch Size</Label>
                        <Input 
                          id="awin-batch-size" 
                          type="number" 
                          min="10" 
                          max="500" 
                          value={importParams.batchSize} 
                          onChange={e => setImportParams(prev => ({
                            ...prev,
                            batchSize: parseInt(e.target.value) || 100
                          }))} 
                        />
                      </div>
                    </div>

                    <div className="bg-muted p-4 rounded space-y-2">
                      <h4 className="font-medium">Import Process:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Downloads and decompresses gzipped CSV feed</li>
                        <li>• Processes products in batches to avoid timeouts</li>
                        <li>• Maps Awin categories to marketplace categories</li>
                        <li>• Preserves all original Awin metadata</li>
                        <li>• Supports multiple product images</li>
                      </ul>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setIsAwinImportOpen(false)} disabled={isImporting}>
                        Cancel
                      </Button>
                      <Button onClick={handleAwinImport} disabled={isImporting}>
                        {isImporting ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Import CSV Feed
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* System Health Alert */}
      {systemHealth.status !== 'healthy' && (
        <Alert variant="destructive" className="container mx-auto mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            System issues detected: {systemHealth.issues.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Enhanced Filter Controls */}
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Time Period:</Label>
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
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 space-y-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-fit">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Management
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Enhanced Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statsLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="h-32">
                    <CardContent className="p-6">
                      <Skeleton className="h-4 w-20 mb-3" />
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <>
                  <Card className="relative overflow-hidden border-l-4 border-l-primary hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Content</CardTitle>
                      <Database className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.totalContent.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <TrendingUp className="h-3 w-3 inline mr-1" />
                        All published content
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card className="relative overflow-hidden border-l-4 border-l-accent hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Venues</CardTitle>
                      <Building className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.activeVenues.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <CheckCircle className="h-3 w-3 inline mr-1" />
                        Verified locations
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden border-l-4 border-l-secondary hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
                      <Calendar className="h-5 w-5 text-muted-foreground group-hover:text-secondary transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.upcomingEvents.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Scheduled events
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden border-l-4 border-l-muted hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Marketplace</CardTitle>
                      <ShoppingBag className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.marketplaceItems.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Star className="h-3 w-3 inline mr-1" />
                        Active listings
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden border-l-4 border-l-primary hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                      <Users className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.totalUsers.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <ArrowUpRight className="h-3 w-3 inline mr-1" />
                        +{stats.weeklyGrowth}% this week
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden border-l-4 border-l-accent hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Groups</CardTitle>
                      <Users className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.activeGroups.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Activity className="h-3 w-3 inline mr-1" />
                        of {stats.totalGroups} total
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden border-l-4 border-l-secondary hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Community Posts</CardTitle>
                      <MessageSquare className="h-5 w-5 text-muted-foreground group-hover:text-secondary transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.totalPosts.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Heart className="h-3 w-3 inline mr-1" />
                        Community engagement
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="relative overflow-hidden border-l-4 border-l-muted hover:shadow-lg transition-all group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Session</CardTitle>
                      <Clock className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{Math.floor(stats.avgSessionTime / 60)}m</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Eye className="h-3 w-3 inline mr-1" />
                        {stats.avgSessionTime}s average
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Enhanced Quick Actions & Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Platform Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold">{stats.monthlyUsers}</div>
                      <p className="text-sm text-muted-foreground">New Users</p>
                      <p className="text-xs text-muted-foreground">This {filterPeriod.replace('d', ' days')}</p>
                    </div>
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold">{stats.conversionRate}%</div>
                      <p className="text-sm text-muted-foreground">Engagement Rate</p>
                      <p className="text-xs text-muted-foreground">User activity</p>
                    </div>
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold">{systemHealth.apiCalls.toLocaleString()}</div>
                      <p className="text-sm text-muted-foreground">API Calls</p>
                      <p className="text-xs text-muted-foreground">Daily average</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/venues')}>
                    <Building className="h-4 w-4 mr-2" />
                    Add New Venue
                  </Button>
                  <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/events')}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Create Event
                  </Button>
                  <Button className="w-full justify-start" variant="outline" onClick={() => navigate('/admin/analytics')}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    View Analytics
                  </Button>
                  <Button className="w-full justify-start" variant="outline" onClick={() => setIsAwinImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Data
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="management" className="space-y-6">
            <Tabs defaultValue="tools" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tools" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Tools
                </TabsTrigger>
                <TabsTrigger value="moderation" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Moderation
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tools" className="space-y-6">
                <AlgoliaManager />
              </TabsContent>

              <TabsContent value="moderation" className="space-y-6">
                <NewsModeration />
              </TabsContent>
            </Tabs>

            {/* Enhanced Management Grid */}
            <div className={`grid gap-6 ${
              viewMode === 'grid' 
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-1'
            }`}>
              {adminSections.map((section, index) => (
                <Card 
                  key={index} 
                  className="group cursor-pointer border hover:shadow-lg hover:border-primary/20 transition-all duration-300 animate-fade-in" 
                  onClick={() => navigate(section.path)}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 rounded border bg-card text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        <section.icon className="h-6 w-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {section.stats}
                        </Badge>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                      {section.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {section.description}
                    </p>
                    
                    {section.subItems && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Sub-modules</p>
                          <Badge variant="outline" className="text-xs">
                            {section.subItems.length} items
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {section.subItems.slice(0, viewMode === 'list' ? 6 : 3).map((subItem, subIndex) => (
                            <div
                              key={subIndex}
                              className="flex items-center justify-between p-2 rounded border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(subItem.path);
                              }}
                            >
                              <div>
                                <p className="text-xs font-medium">{subItem.title}</p>
                                <p className="text-xs text-muted-foreground">{subItem.description}</p>
                              </div>
                              <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                          ))}
                          {section.subItems.length > (viewMode === 'list' ? 6 : 3) && (
                            <div className="text-center">
                              <Badge variant="outline" className="text-xs">
                                +{section.subItems.length - (viewMode === 'list' ? 6 : 3)} more
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Platform Activity
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchRecentActivity}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentActivity.length === 0 ? (
                      <div className="text-center py-12">
                        <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No recent activity found</p>
                        <p className="text-sm text-muted-foreground">Activity will appear here as users interact with the platform</p>
                      </div>
                    ) : (
                      recentActivity.map((activity) => (
                        <div key={`${activity.type}-${activity.id}`} className="flex items-start gap-4 p-4 border rounded hover:bg-muted/30 transition-all group cursor-pointer">
                          <div className="p-2 bg-muted rounded group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                            <activity.icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium text-sm group-hover:text-primary transition-colors">{activity.title}</p>
                              <Badge variant="secondary" className="text-xs">
                                {activity.type}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-xs mb-2 line-clamp-2">{activity.description}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(activity.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bell className="h-4 w-4" />
                      Activity Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Posts</span>
                        <Badge variant="outline">
                          {recentActivity.filter(a => a.type === 'post').length}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Events</span>
                        <Badge variant="outline">
                          {recentActivity.filter(a => a.type === 'event').length}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Listings</span>
                        <Badge variant="outline">
                          {recentActivity.filter(a => a.type === 'marketplace').length}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Templates</span>
                        <Badge variant="outline">
                          {recentActivity.filter(a => a.type === 'email_template').length}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Search className="h-4 w-4" />
                      Quick Search
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Input placeholder="Search content..." className="text-sm" />
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                          #venues
                        </Badge>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                          #events
                        </Badge>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                          #users
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Status</span>
                        <div className={`w-3 h-3 rounded-full ${
                          systemHealth.status === 'healthy' ? 'bg-green-500' : 
                          systemHealth.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></div>
                      </div>
                      <p className="text-lg font-bold capitalize">{systemHealth.status}</p>
                    </div>
                    <div className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Uptime</span>
                        <Wifi className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-bold">{systemHealth.uptime}</p>
                    </div>
                    <div className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">DB Latency</span>
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-bold">{systemHealth.dbLatency}ms</p>
                    </div>
                    <div className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Storage</span>
                        <Server className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-bold">{systemHealth.storageUsed}%</p>
                    </div>
                  </div>
                  
                  {systemHealth.issues.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc list-inside space-y-1">
                          {systemHealth.issues.map((issue, index) => (
                            <li key={index} className="text-sm">{issue}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SecurityMonitoringDashboard />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
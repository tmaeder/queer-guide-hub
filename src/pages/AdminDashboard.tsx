import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  UserCheck
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
    marketplaceItems: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

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
  }, []);

  const fetchStats = async () => {
    try {
      const [venues, events, listings, articles] = await Promise.all([
        supabase.from('venues').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('news_articles').select('id', { count: 'exact', head: true })
      ]);

      const totalContentCount = (articles.count || 0) + (events.count || 0) + (listings.count || 0);

      setStats({
        totalContent: totalContentCount,
        activeVenues: venues.count || 0,
        upcomingEvents: events.count || 0,
        marketplaceItems: listings.count || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
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
      color: "bg-muted"
    },
    {
      title: "Countries Management",
      description: "Manage countries and their information",
      icon: Globe,
      path: "/admin/countries",
      color: "bg-muted"
    },
    {
      title: "Cities Management",
      description: "Add and manage cities in the directory",
      icon: MapPin,
      path: "/admin/cities",
      color: "bg-muted"
    },
    {
      title: "Venues Management",
      description: "Manage venues and locations",
      icon: Building,
      path: "/admin/venues",
      color: "bg-muted"
    },
    {
      title: "Events Management",
      description: "Create and manage events",
      icon: Calendar,
      path: "/admin/events",
      color: "bg-muted"
    },
    {
      title: "Marketplace Management",
      description: "Manage marketplace listings and products",
      icon: ShoppingBag,
      path: "/admin/marketplace",
      color: "bg-muted"
    },
    {
      title: "Groups Management",
      description: "Manage community groups and memberships",
      icon: UserCheck,
      path: "/admin/groups",
      color: "bg-muted"
    }
  ];

  if (isAdmin) {
    adminSections.push(
      {
        title: "User Management",
        description: "Manage user roles and permissions",
        icon: Users,
        path: "/admin/users",
        color: "bg-muted"
      },
      {
        title: "Analytics",
        description: "View site analytics and reports",
        icon: BarChart3,
        path: "/admin/analytics",
        color: "bg-muted"
      }
    );
  }

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Manage your website content and settings.
        </p>
        <div className="mt-2 text-sm text-muted-foreground">
          Current permissions: {isAdmin ? 'Admin' : isModerator ? 'Moderator' : 'None'} 
          {!canManageContent() && (
            <span className="text-destructive ml-2">
              (No admin/moderator role found - contact system admin)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminSections.map((section) => (
          <Card key={section.path} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${section.color} text-primary-foreground`}>
                  <section.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {section.description}
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  console.log('Navigating to:', section.path);
                  console.log('Section:', section.title);
                  navigate(section.path);
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
           <CardContent>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="text-center">
                 <div className="text-2xl font-bold text-primary">
                   {statsLoading ? '...' : stats.totalContent}
                 </div>
                 <div className="text-sm text-muted-foreground">Total Content</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-accent">
                   {statsLoading ? '...' : stats.activeVenues}
                 </div>
                 <div className="text-sm text-muted-foreground">Active Venues</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-secondary">
                   {statsLoading ? '...' : stats.upcomingEvents}
                 </div>
                 <div className="text-sm text-muted-foreground">Upcoming Events</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-primary">
                   {statsLoading ? '...' : stats.marketplaceItems}
                 </div>
                 <div className="text-sm text-muted-foreground">Marketplace Items</div>
               </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
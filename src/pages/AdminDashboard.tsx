import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Settings, 
  FileText, 
  Tags, 
  MapPin, 
  Building, 
  Calendar,
  ShoppingBag,
  Users,
  BarChart3
} from "lucide-react";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, canManageContent, loading } = useAdminRoles();

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
      title: "Unified CMS",
      description: "All-in-one content management for everything",
      icon: Settings,
      path: "/admin/cms",
      color: "bg-gradient-to-r from-purple-500 to-pink-500"
    },
    {
      title: "Content Management",
      description: "Manage website content, pages, and blog posts",
      icon: FileText,
      path: "/admin/content",
      color: "bg-blue-500"
    },
    {
      title: "Tags Management",
      description: "Create and manage tags for content organization",
      icon: Tags,
      path: "/admin/tags",
      color: "bg-purple-500"
    },
    {
      title: "Cities Management",
      description: "Add and manage cities in the directory",
      icon: MapPin,
      path: "/admin/cities",
      color: "bg-green-500"
    },
    {
      title: "Venues Management",
      description: "Manage venues and locations",
      icon: Building,
      path: "/admin/venues",
      color: "bg-orange-500"
    },
    {
      title: "Events Management",
      description: "Create and manage events",
      icon: Calendar,
      path: "/admin/events",
      color: "bg-red-500"
    },
    {
      title: "Marketplace Management",
      description: "Manage marketplace listings and products",
      icon: ShoppingBag,
      path: "/admin/marketplace",
      color: "bg-pink-500"
    }
  ];

  if (isAdmin) {
    adminSections.push(
      {
        title: "User Management",
        description: "Manage user roles and permissions",
        icon: Users,
        path: "/admin/users",
        color: "bg-gray-500"
      },
      {
        title: "Analytics",
        description: "View site analytics and reports",
        icon: BarChart3,
        path: "/admin/analytics",
        color: "bg-indigo-500"
      }
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Manage your website content and settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminSections.map((section) => (
          <Card key={section.path} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${section.color} text-white`}>
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
                onClick={() => navigate(section.path)}
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
                <div className="text-2xl font-bold text-blue-600">-</div>
                <div className="text-sm text-muted-foreground">Total Content</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">-</div>
                <div className="text-sm text-muted-foreground">Active Venues</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">-</div>
                <div className="text-sm text-muted-foreground">Upcoming Events</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">-</div>
                <div className="text-sm text-muted-foreground">Marketplace Items</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
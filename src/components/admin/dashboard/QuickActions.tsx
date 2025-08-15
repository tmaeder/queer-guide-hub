import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Plus, 
  Upload, 
  Download, 
  Settings, 
  Users, 
  Building, 
  Calendar, 
  ShoppingBag, 
  Tags,
  Globe,
  MapPin,
  FileText,
  Newspaper,
  Zap
} from "lucide-react";

export function QuickActions() {
  const navigate = useNavigate();

  const quickActions = [
    {
      title: "Add New Event",
      description: "Create a new event",
      icon: Plus,
      action: () => navigate("/admin/events"),
      variant: "default" as const
    },
    {
      title: "Add New Venue",
      description: "Register a new venue",
      icon: Building,
      action: () => navigate("/admin/venues"),
      variant: "outline" as const
    },
    {
      title: "Import Data",
      description: "Bulk import content",
      icon: Upload,
      action: () => navigate("/admin/import-hub"),
      variant: "outline" as const
    },
    {
      title: "Manage Users",
      description: "View and manage users",
      icon: Users,
      action: () => navigate("/admin/users"),
      variant: "outline" as const
    }
  ];

  const managementSections = [
    {
      title: "Content Management",
      items: [
        { label: "Events", icon: Calendar, path: "/admin/events" },
        { label: "Venues", icon: Building, path: "/admin/venues" },
        { label: "Marketplace", icon: ShoppingBag, path: "/admin/marketplace" },
        { label: "Groups", icon: Users, path: "/admin/groups" }
      ]
    },
    {
      title: "System Management",
      items: [
        { label: "Tags", icon: Tags, path: "/admin/tags" },
        { label: "Countries", icon: Globe, path: "/admin/countries" },
        { label: "Cities", icon: MapPin, path: "/admin/cities" },
        { label: "Email Templates", icon: FileText, path: "/admin/email-templates" }
      ]
    },
    {
      title: "Tools & Utilities",
      items: [
        { label: "Import Hub", icon: Upload, path: "/admin/import-hub" },
        { label: "News Sources", icon: Newspaper, path: "/admin/news-sources" },
        { label: "Analytics", icon: Zap, path: "/admin/analytics" },
        { label: "Settings", icon: Settings, path: "/admin/settings" }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.title}
                  variant={action.variant}
                  onClick={action.action}
                  className="h-auto p-4 justify-start"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">{action.title}</div>
                      <div className="text-xs opacity-70">{action.description}</div>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Management Sections */}
      <div className="grid gap-4 md:grid-cols-3">
        {managementSections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.label}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.path)}
                    className="w-full justify-start h-8"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
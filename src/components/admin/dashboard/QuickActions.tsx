import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import Box from '@mui/material/Box';
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
  Zap,
  FileEdit
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
        { label: "CMS", icon: FileEdit, path: "/admin/cms" },
        { label: "Import Hub", icon: Upload, path: "/admin/import-hub" },
        { label: "News Sources", icon: Newspaper, path: "/admin/news-sources" },
        { label: "Analytics", icon: Zap, path: "/admin/analytics" },
        { label: "Settings", icon: Settings, path: "/admin/settings" }
      ]
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap style={{ height: 16, width: 16 }} />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.title}
                  variant={action.variant}
                  onClick={action.action}
                  style={{ height: 'auto', padding: 16, justifyContent: 'flex-start' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Icon style={{ height: 20, width: 20 }} />
                    <Box sx={{ textAlign: 'left' }}>
                      <Box sx={{ fontWeight: 500 }}>{action.title}</Box>
                      <Box sx={{ fontSize: '0.75rem', opacity: 0.7 }}>{action.description}</Box>
                    </Box>
                  </Box>
                </Button>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {/* Management Sections */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        {managementSections.map((section) => (
          <Card key={section.title}>
            <CardHeader style={{ paddingBottom: 12 }}>
              <CardTitle style={{ fontSize: '0.875rem' }}>{section.title}</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.label}
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(item.path)}
                    style={{ width: '100%', justifyContent: 'flex-start', height: 32 }}
                  >
                    <Icon style={{ height: 16, width: 16, marginRight: 8 }} />
                    {item.label}
                  </Button>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router';
import {
  Plus,
  Upload,
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
  FileEdit,
} from 'lucide-react';

export function QuickActions() {
  const navigate = useNavigate();

  const quickActions = [
    { title: 'Add New Event', description: 'Create a new event', icon: Plus, action: () => navigate('/admin/content/events'), variant: 'default' as const },
    { title: 'Add New Venue', description: 'Register a new venue', icon: Building, action: () => navigate('/admin/content/venues'), variant: 'outline' as const },
    { title: 'Import Data', description: 'Bulk import content', icon: Upload, action: () => navigate('/admin/imports'), variant: 'outline' as const },
    { title: 'Manage Users', description: 'View and manage users', icon: Users, action: () => navigate('/admin/users'), variant: 'outline' as const },
  ];

  const managementSections = [
    {
      title: 'Content Management',
      items: [
        { label: 'Events', icon: Calendar, path: '/admin/content/events' },
        { label: 'Venues', icon: Building, path: '/admin/content/venues' },
        { label: 'Marketplace', icon: ShoppingBag, path: '/admin/content/marketplace_listings' },
        { label: 'Groups', icon: Users, path: '/admin/content/community_groups' },
      ],
    },
    {
      title: 'System Management',
      items: [
        { label: 'Tags', icon: Tags, path: '/admin/content/unified_tags' },
        { label: 'Countries', icon: Globe, path: '/admin/content/countries' },
        { label: 'Cities', icon: MapPin, path: '/admin/content/cities' },
        { label: 'Email Templates', icon: FileText, path: '/admin/email-templates' },
      ],
    },
    {
      title: 'Tools & Utilities',
      items: [
        { label: 'CMS', icon: FileEdit, path: '/admin/content' },
        { label: 'Import Hub', icon: Upload, path: '/admin/imports' },
        { label: 'News Sources', icon: Newspaper, path: '/admin/imports/news-sources' },
        { label: 'Analytics', icon: Zap, path: '/admin/analytics' },
        { label: 'Settings', icon: Settings, path: '/admin/settings' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap style={{ height: 16, width: 16 }} />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.title}
                  variant={action.variant}
                  onClick={action.action}
                  style={{ height: 'auto', padding: '10px 12px', justifyContent: 'flex-start' }}
                >
                  <div className="flex items-center gap-2">
                    <Icon style={{ height: 18, width: 18, flexShrink: 0 }} />
                    <div className="text-left min-w-0">
                      <div className="font-medium text-sm truncate">{action.title}</div>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {managementSections.map((section) => (
          <Card key={section.title}>
            <CardHeader style={{ paddingBottom: 8 }}>
              <CardTitle style={{ fontSize: '0.8125rem' }}>{section.title}</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 0 }}>
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
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, FileEdit, Upload, Shield } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAdminRoles } from '@/hooks/useAdminRoles';

export function AdminMenu() {
  const navigate = useNavigate();
  const { isAdmin, isModerator } = useAdminRoles();

  // Only show menu if user has admin or moderator privileges
  if (!isAdmin && !isModerator) return null;

  const adminMenuItems = [
    {
      to: "/admin",
      icon: Settings,
      label: "Admin"
    },
    {
      to: "/admin/cms",
      icon: FileEdit,
      label: "CMS"
    },
    {
      to: "/admin/import-hub",
      icon: Upload,
      label: "Import"
    }
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-10 w-10 p-0" aria-label="Admin menu">
          <Shield className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-4 bg-background/90 backdrop-blur-md border-white/20 z-50">
        <div className="grid grid-cols-1 gap-2">
          {adminMenuItems.map(item => (
            <Button 
              key={item.to} 
              variant="ghost" 
              size="sm" 
              className="flex items-center justify-start p-3 h-auto gap-2" 
              onClick={() => navigate(item.to)}
            >
              <item.icon className="h-4 w-4" />
              <span className="text-sm">{item.label}</span>
            </Button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Settings, FileEdit, Upload, Shield } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
        <Button variant="ghost" size="sm" style={{ position: 'relative', height: 40, width: 40, padding: 0 }} aria-label="Admin menu">
          <Shield style={{ width: 16, height: 16 }} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: 192, padding: 16, zIndex: 50 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
          {adminMenuItems.map(item => (
            <Button
              key={item.to}
              variant="ghost"
              size="sm"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: 12, height: 'auto', gap: 8 }}
              onClick={() => navigate(item.to)}
            >
              <item.icon style={{ width: 16, height: 16 }} />
              <Typography variant="body2">{item.label}</Typography>
            </Button>
          ))}
        </Box>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

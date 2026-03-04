import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { useAdminRoles } from '@/hooks/useAdminRoles';

export function AdminMenu() {
  const navigate = useNavigate();
  const { isAdmin, isModerator } = useAdminRoles();

  // Only show menu if user has admin or moderator privileges
  if (!isAdmin && !isModerator) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      style={{ position: 'relative', height: 40, width: 40, padding: 0 }}
      aria-label="Admin Console"
      title="Admin Console"
      onClick={() => navigate('/admin')}
    >
      <Shield style={{ width: 16, height: 16 }} />
    </Button>
  );
}

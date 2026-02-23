import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEditDialog } from './AdminEditDialog';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import Tooltip from '@mui/material/Tooltip';

interface AdminEditButtonProps {
  contentType: string;
  contentId: string;
  contentName?: string;
  /** Current data for the content item — used to pre-fill the edit form */
  currentData?: Record<string, unknown>;
  size?: 'sm' | 'default';
  onSaved?: () => void;
}

export function AdminEditButton({
  contentType,
  contentId,
  contentName,
  currentData,
  size = 'sm',
  onSaved,
}: AdminEditButtonProps) {
  const { canManageContent, loading } = useAdminRoles();
  const [open, setOpen] = useState(false);

  if (loading || !canManageContent()) return null;

  return (
    <>
      <Tooltip title="Edit (Admin)">
        <Button
          variant="outline"
          size={size}
          onClick={() => setOpen(true)}
          aria-label="Edit content"
        >
          <Pencil style={{ width: 16, height: 16 }} />
        </Button>
      </Tooltip>
      <AdminEditDialog
        open={open}
        onOpenChange={setOpen}
        contentType={contentType}
        contentId={contentId}
        contentName={contentName}
        currentData={currentData}
        onSaved={onSaved}
      />
    </>
  );
}

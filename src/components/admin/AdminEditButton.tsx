import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AdminEditDialog } from './AdminEditDialog';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAuth } from '@/hooks/useAuth';

interface AdminEditButtonProps {
  contentType: string;
  contentId: string;
  contentName?: string;
  /** Current data for the content item — used to pre-fill the edit form */
  currentData?: Record<string, unknown>;
  /** When provided, the owner of this content can also edit (in addition to admins/moderators). */
  ownerUserId?: string | null;
  size?: 'sm' | 'default';
  onSaved?: () => void;
}

export function AdminEditButton({
  contentType,
  contentId,
  contentName,
  currentData,
  ownerUserId,
  size = 'sm',
  onSaved,
}: AdminEditButtonProps) {
  const { canManageContent, loading } = useAdminRoles();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const isOwner = Boolean(ownerUserId && user?.id && ownerUserId === user.id);
  if (loading || (!canManageContent() && !isOwner)) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={size}
              onClick={() => setOpen(true)}
              aria-label="Edit content"
            >
              <Pencil style={{ width: 16, height: 16 }} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit (Admin)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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

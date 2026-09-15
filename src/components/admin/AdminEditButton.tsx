import { useState } from 'react';
import { ChevronDown, History, Pencil, SquarePen, SquareArrowOutUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AdminFullEditSheet } from './inline/AdminFullEditSheet';
import { RevisionHistorySheet } from './RevisionHistorySheet';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAdminEditMode } from '@/hooks/useAdminEditMode';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { cmsEditPath } from '@/lib/cmsLinks';

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

/**
 * The admin control group on a public page: edit here, or cross to the CMS.
 *
 * Crossing used to be impossible. An admin on a public page could open the
 * in-place sheet and nothing else — there was no link to the record in the
 * CMS, and the reason was structural: there is no `/admin/content/:type/:id`
 * route, because the editor is a modal owned by AdminShell. `cmsEditPath`
 * builds the `?edit=` URL that ContentListPanel now honours for every type.
 *
 * The pencil stays a one-click direct action — it is the common case and was
 * already on eight pages. Everything new hangs off the adjacent chevron so no
 * action row grows by four buttons.
 */
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
  const { pinned, setPinned } = useAdminEditMode();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isOwner = Boolean(ownerUserId && user?.id && ownerUserId === user.id);
  const isStaff = canManageContent();
  if (loading || (!isStaff && !isOwner)) return null;

  const cmsPath = cmsEditPath(contentType, contentId);

  return (
    <>
      <TooltipProvider>
        <div className="inline-flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={size}
                onClick={() => setOpen(true)}
                aria-label="Edit all fields"
                className={isStaff ? 'rounded-r-none border-r-0' : undefined}
              >
                <Pencil size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit all fields (Admin)</TooltipContent>
          </Tooltip>

          {/* The owner of a piece of content is not staff: they may edit their
              own record, but the CMS, revision history and the site-wide inline
              edit mode are all staff tools. */}
          {isStaff && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size={size}
                  aria-label="More admin actions"
                  className="rounded-l-none px-2"
                >
                  <ChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Null only for a content type that is not in the registry,
                    which would mean a stale type string on the page. */}
                {cmsPath && (
                  <DropdownMenuItem onSelect={() => navigate(cmsPath)}>
                    <SquareArrowOutUpRight size={16} />
                    Open in CMS
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                  <History size={16} />
                  Revision history
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={pinned}
                  onCheckedChange={(v) => setPinned(Boolean(v))}
                >
                  <SquarePen size={16} />
                  Inline edit mode
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TooltipProvider>

      <AdminFullEditSheet
        open={open}
        onOpenChange={setOpen}
        contentType={contentType}
        contentId={contentId}
        contentName={contentName}
        currentData={currentData}
        onSaved={onSaved}
      />
      {isStaff && (
        <RevisionHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          contentType={contentType}
          contentId={contentId}
          contentName={contentName}
          onReverted={onSaved}
        />
      )}
    </>
  );
}

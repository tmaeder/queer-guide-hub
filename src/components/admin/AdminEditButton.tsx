import { useState } from 'react';
import { ChevronDown, History, Pencil, SquareArrowOutUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
 * already on eight pages. Everything else hangs off the adjacent chevron so no
 * action row grows by four buttons.
 *
 * SHAPE. This is the repo's only split button, and the first cut built it by
 * deleting the pencil's right border (`border-r-0`) so the two halves would
 * not show a double line. That removed the only thing saying it IS two
 * controls: at rest it read as one outlined pill, and the split only became
 * visible mid-hover, when one half filled ink on its own. The halves now keep
 * both borders and the chevron is pulled one pixel left, so the two collapse
 * into a single shared seam that survives either hover state.
 *
 * The seam is `border-input`, NOT the 12%-ink divider hairline the design
 * system uses between surfaces — `button.tsx`'s own comment on the `outline`
 * variant settles that: "an outline button has no fill, so its edge IS the
 * control boundary and WCAG 1.4.11 requires it — hence `border-input` ...
 * rather than the 12%-ink divider hairline." A seam between two halves of one
 * control is a control boundary, so it takes the same token as the outside.
 *
 * `focus-visible:relative focus-visible:z-10` is load-bearing on both halves:
 * the base button style is `ring-2 ring-offset-2`, and on adjoined controls
 * that ring is drawn under the neighbour, clipping the focus indicator on
 * whichever half is not last in the DOM.
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
                // The accessible name carries the "(Admin)" qualifier too. It
                // used to say only "Edit all fields" while the tooltip said
                // why the control exists, so the one piece of explanation was
                // the one piece a screen reader never got.
                aria-label="Edit all fields (Admin)"
                className={
                  isStaff ? 'rounded-r-none focus-visible:relative focus-visible:z-10' : undefined
                }
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size={size}
                      aria-label="More admin actions"
                      className="-ml-px rounded-l-none px-2 focus-visible:relative focus-visible:z-10"
                    >
                      <ChevronDown size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More admin actions</TooltipContent>
              </Tooltip>

              <DropdownMenuContent align="end" className="w-60">
                {/* Two groups, because the three actions are not the same kind
                    of thing. The first two act on THIS RECORD; the pin is a
                    site-wide, session-scoped mode (useAdminEditMode's PIN_KEY
                    in sessionStorage). A flat list is how someone turns on a
                    global mode believing it applies to the page in front of
                    them. */}
                <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
                  This record
                </DropdownMenuLabel>
                {/* Null only for a content type that is not in the registry,
                    which would mean a stale type string on the page. */}
                {cmsPath && (
                  <DropdownMenuItem onSelect={() => navigate(cmsPath)}>
                    {/* `mr-2` because DropdownMenuItem has no `gap` of its own —
                        unlike Button, whose base style carries `gap-2`. 32 of
                        the repo's 72 menu items space their icon this way; this
                        one spaced it not at all, so the glyph sat flush against
                        the label. Fixed here rather than in the primitive,
                        which would double-space all 32. */}
                    <SquareArrowOutUpRight size={16} className="mr-2" />
                    Open in CMS
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                  <History size={16} className="mr-2" />
                  Revision history
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
                  This page
                </DropdownMenuLabel>
                {/* No icon here on purpose. A checkbox item reserves its left
                    gutter for the check indicator, so an icon inside one is a
                    second glyph competing with the mark that actually carries
                    the state. */}
                <DropdownMenuCheckboxItem
                  checked={pinned}
                  onCheckedChange={(v) => setPinned(Boolean(v))}
                >
                  Inline edit mode
                  {/* Alt-hold is the fast path and nothing advertised it —
                      which is the discoverability problem the pin was added to
                      solve, one layer down. */}
                  <DropdownMenuShortcut>Alt</DropdownMenuShortcut>
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

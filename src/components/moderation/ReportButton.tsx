import { useState } from 'react';
import { Flag } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ReportDialog } from './ReportDialog';

interface ReportButtonProps {
  contentType: string;
  contentId: string;
  contentName?: string;
  size?: 'sm' | 'default';
  /** Render "Report issue" as text — for overflow menus, where a bare flag is unclear. */
  showLabel?: boolean;
}

export function ReportButton({
  contentType,
  contentId,
  contentName,
  size = 'sm',
  showLabel = false,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {showLabel ? (
        <Button variant="ghost" size={size} onClick={() => setOpen(true)}>
          <Flag size={16} className="mr-2" aria-hidden="true" />
          Report issue
        </Button>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size={size}
                onClick={() => setOpen(true)}
                aria-label="Report issue"
              >
                <Flag size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Report issue</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        contentType={contentType}
        contentId={contentId}
        contentName={contentName}
      />
    </>
  );
}

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ReportDialog } from './ReportDialog';

interface ReportButtonProps {
  contentType: string;
  contentId: string;
  contentName?: string;
  size?: 'sm' | 'default';
}

export function ReportButton({ contentType, contentId, contentName, size = 'sm' }: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={size}
              onClick={() => setOpen(true)}
              aria-label="Report issue"
            >
              <Flag style={{ width: 16, height: 16 }} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Report issue</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportDialog } from './ReportDialog';
import Tooltip from '@mui/material/Tooltip';

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
      <Tooltip title="Report issue">
        <Button
          variant="outline"
          size={size}
          onClick={() => setOpen(true)}
          aria-label="Report issue"
        >
          <Flag style={{ width: 16, height: 16 }} />
        </Button>
      </Tooltip>
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

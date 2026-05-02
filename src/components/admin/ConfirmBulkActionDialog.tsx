import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmBulkActionDialogProps {
  open: boolean;
  action: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmBulkActionDialog({ open, action, count, onConfirm, onCancel }: ConfirmBulkActionDialogProps) {
  const isDestructive = action === 'remove';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Are you sure you want to <strong>{action}</strong> {count} link{count !== 1 ? 's' : ''}?
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={isDestructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {action.charAt(0).toUpperCase() + action.slice(1)} {count} link{count !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmBulkActionDialog;

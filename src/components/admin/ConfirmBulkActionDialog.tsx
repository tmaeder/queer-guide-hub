import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MuiButton from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface ConfirmBulkActionDialogProps {
  open: boolean;
  action: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmBulkActionDialog({ open, action, count, onConfirm, onCancel }: ConfirmBulkActionDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm Action</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to <strong>{action}</strong> {count} link{count !== 1 ? 's' : ''}?
        </Typography>
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onCancel}>Cancel</MuiButton>
        <MuiButton
          variant="contained"
          color={action === 'remove' ? 'error' : 'primary'}
          onClick={onConfirm}
        >
          {action.charAt(0).toUpperCase() + action.slice(1)} {count} link{count !== 1 ? 's' : ''}
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmBulkActionDialog;

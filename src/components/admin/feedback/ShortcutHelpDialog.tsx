import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { shortcutHelp } from '@/hooks/useFeedbackShortcuts';

export function ShortcutHelpDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
          {shortcutHelp.map((s) => (
            <Box key={s.key} sx={{ display: 'contents' }}>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  bgcolor: 'action.hover',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 0.5,
                  textAlign: 'center',
                  fontSize: '0.7rem',
                }}
              >
                {s.key}
              </Typography>
              <Typography variant="caption" sx={{ alignSelf: 'center', fontSize: '0.75rem' }}>
                {s.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

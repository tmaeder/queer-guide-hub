import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MuiButton from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { ArrowRight } from 'lucide-react';
import type { ContentLink } from '@/hooks/useContentLinks';

interface EditLinkDialogProps {
  open: boolean;
  link: ContentLink | null;
  onClose: () => void;
  onSave: (newUrl: string) => Promise<void>;
}

export function EditLinkDialog({ open, link, onClose, onSave }: EditLinkDialogProps) {
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (link) {
      setNewUrl(link.original_url);
      setUrlError('');
    }
  }, [link]);

  const validate = (url: string) => {
    try {
      new URL(url);
      setUrlError('');
      return true;
    } catch {
      setUrlError('Invalid URL format');
      return false;
    }
  };

  const handleSave = async () => {
    if (!validate(newUrl)) return;
    setSaving(true);
    try {
      await onSave(newUrl);
      onClose();
    } catch (e: unknown) {
      setUrlError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const useRedirect = () => {
    if (link?.final_url) {
      setNewUrl(link.final_url);
      setUrlError('');
    }
  };

  if (!link) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Link URL</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
          <Chip size="small" label={link.content_type} variant="outlined" />
          <Chip size="small" label={link.field_name} variant="outlined" />
          <Chip size="small" label={link.status} color={link.status === 'BROKEN' ? 'error' : link.status === 'REDIRECT' ? 'warning' : 'default'} />
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Current URL
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          {link.original_url}
        </Typography>

        {link.final_url && link.final_url !== link.original_url && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <ArrowRight style={{ width: 14, height: 14 }} /> Redirects to
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', flex: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                {link.final_url}
              </Typography>
              <MuiButton size="small" variant="outlined" onClick={useRedirect} sx={{ whiteSpace: 'nowrap' }}>
                Use this
              </MuiButton>
            </Box>
          </>
        )}

        <TextField
          fullWidth
          label="New URL"
          value={newUrl}
          onChange={e => { setNewUrl(e.target.value); setUrlError(''); }}
          error={!!urlError}
          helperText={urlError || 'The source content URL will be updated to this value'}
          size="small"
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Cancel</MuiButton>
        <MuiButton
          variant="contained"
          onClick={handleSave}
          disabled={saving || !newUrl || newUrl === link.original_url}
        >
          {saving ? 'Saving...' : 'Save'}
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
}

export default EditLinkDialog;

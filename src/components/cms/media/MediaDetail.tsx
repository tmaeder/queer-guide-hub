/**
 * MediaDetail
 * Detail/edit panel for a single media item.
 * Shows preview, editable metadata fields, file info, and delete action.
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Divider,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Chip,
} from '@mui/material';
import {
  X,
  Trash2,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { CMSMedia } from '@/types/cms';

interface MediaDetailProps {
  media: CMSMedia;
  /** Called with partial updates. Returns true on success. */
  onUpdate: (updates: Partial<CMSMedia>) => Promise<boolean>;
  /** Called after successful deletion */
  onDelete?: () => void;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getMediaPreviewUrl(media: CMSMedia): string {
  const { data } = supabase.storage.from('cms-media').getPublicUrl(media.storage_path);
  return data.publicUrl;
}

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={64} className="text-gray-300" />;
  if (mimeType.startsWith('video/')) return <Film size={64} className="text-gray-300" />;
  if (mimeType.startsWith('audio/')) return <Music size={64} className="text-gray-300" />;
  return <FileText size={64} className="text-gray-300" />;
}

export default function MediaDetail({ media, onUpdate, onDelete, onClose }: MediaDetailProps) {
  const [altEn, setAltEn] = useState('');
  const [altDe, setAltDe] = useState('');
  const [captionEn, setCaptionEn] = useState('');
  const [captionDe, setCaptionDe] = useState('');
  const [attribution, setAttribution] = useState('');
  const [license, setLicense] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Populate form from media prop
  useEffect(() => {
    setAltEn(media.alt_text?.en ?? '');
    setAltDe(media.alt_text?.de ?? '');
    setCaptionEn(media.caption?.en ?? '');
    setCaptionDe(media.caption?.de ?? '');
    setAttribution(media.attribution ?? '');
    setLicense(media.license ?? '');
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [media]);

  const isDirty =
    altEn !== (media.alt_text?.en ?? '') ||
    altDe !== (media.alt_text?.de ?? '') ||
    captionEn !== (media.caption?.en ?? '') ||
    captionDe !== (media.caption?.de ?? '') ||
    attribution !== (media.attribution ?? '') ||
    license !== (media.license ?? '');

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const updates: Partial<CMSMedia> = {
      alt_text: {
        ...(media.alt_text ?? {}),
        en: altEn,
        de: altDe,
      },
      caption: {
        ...(media.caption ?? {}),
        en: captionEn,
        de: captionDe,
      },
      attribution: attribution || undefined,
      license: license || undefined,
    };

    const ok = await onUpdate(updates);
    setSaving(false);

    if (ok) {
      setSuccessMsg('Saved successfully.');
    } else {
      setErrorMsg('Failed to save changes.');
    }
  };

  const handleReset = () => {
    setAltEn(media.alt_text?.en ?? '');
    setAltDe(media.alt_text?.de ?? '');
    setCaptionEn(media.caption?.en ?? '');
    setCaptionDe(media.caption?.de ?? '');
    setAttribution(media.attribution ?? '');
    setLicense(media.license ?? '');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(false);
    onDelete?.();
  };

  const isImage = media.mime_type.startsWith('image/');
  const publicUrl = getMediaPreviewUrl(media);

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Media Details
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </Stack>

      <Box sx={{ p: 2 }}>
        {/* Preview */}
        <Box sx={{ mb: 2 }}>
          {isImage ? (
            <Box
              component="img"
              src={publicUrl}
              alt={altEn || media.filename}
              sx={{
                width: '100%',
                maxHeight: 300,
                objectFit: 'contain',
                borderRadius: 1,
                bgcolor: 'grey.100',
                display: 'block',
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.100',
                borderRadius: 1,
              }}
            >
              {getMimeIcon(media.mime_type)}
            </Box>
          )}
        </Box>

        {/* Alerts */}
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}
        {successMsg && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}

        {/* File info */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            File Information
          </Typography>
          <Stack spacing={0.5}>
            <InfoRow label="Filename" value={media.filename} />
            <InfoRow label="Original name" value={media.original_filename} />
            <InfoRow label="MIME type" value={media.mime_type} />
            <InfoRow label="Size" value={formatFileSize(media.file_size)} />
            {media.width && media.height && (
              <InfoRow label="Dimensions" value={`${media.width} x ${media.height} px`} />
            )}
            <InfoRow label="Uploaded" value={formatDate(media.created_at)} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>
                Storage path
              </Typography>
              <Chip label={media.storage_path} size="small" variant="outlined" sx={{ maxWidth: '100%' }} />
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Editable fields */}
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          Alt Text
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            label="Alt text (English)"
            size="small"
            fullWidth
            value={altEn}
            onChange={(e) => setAltEn(e.target.value)}
          />
          <TextField
            label="Alt text (Deutsch)"
            size="small"
            fullWidth
            value={altDe}
            onChange={(e) => setAltDe(e.target.value)}
          />
        </Stack>

        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          Caption
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            label="Caption (English)"
            size="small"
            fullWidth
            multiline
            maxRows={3}
            value={captionEn}
            onChange={(e) => setCaptionEn(e.target.value)}
          />
          <TextField
            label="Caption (Deutsch)"
            size="small"
            fullWidth
            multiline
            maxRows={3}
            value={captionDe}
            onChange={(e) => setCaptionDe(e.target.value)}
          />
        </Stack>

        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            label="Attribution"
            size="small"
            fullWidth
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Photo by..."
          />
          <TextField
            label="License"
            size="small"
            fullWidth
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="CC BY 4.0, Public Domain..."
          />
        </Stack>

        {/* Actions */}
        <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ mt: 2 }}>
          <Box>
            {onDelete && (
              <Button
                size="small"
                color="error"
                startIcon={<Trash2 size={14} />}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete
              </Button>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              color="inherit"
              onClick={handleReset}
              disabled={!isDirty || saving}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Media</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete <strong>{media.original_filename}</strong>? This will
            also remove the file from storage and detach it from any content items. This action
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

/** Small helper for info rows */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}

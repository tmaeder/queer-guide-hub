/**
 * MediaPanel
 * Sidebar panel for managing media attachments on a content item.
 * Shows current attachments, allows adding via MediaPickerDialog, and
 * supports per-attachment role selection and removal.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
  Select,
  MenuItem,
  CircularProgress,
  Tooltip,
  Alert,
  Paper,
} from '@mui/material';
import {
  Plus,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
} from 'lucide-react';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import { api } from '@/integrations/api/client';
import type { CMSMediaAttachment, MediaRole } from '@/types/cms';
import MediaPickerDialog from '../media/MediaPickerDialog';

interface MediaPanelProps {
  /** Source table name, e.g. 'venues' */
  sourceTable: string;
  /** Source record ID */
  sourceId: string;
}

const MEDIA_ROLES: { value: MediaRole; label: string }[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'attachment', label: 'Attachment' },
  { value: 'avatar', label: 'Avatar' },
  { value: 'thumbnail', label: 'Thumbnail' },
];

function getThumbnailUrl(storagePath: string, externalSource?: string): string {
  // External images store the URL directly in storage_path
  if (externalSource) {
    return storagePath;
  }
  const { data } = api.storage.from('cms-media').getPublicUrl(storagePath);
  return data.publicUrl;
}

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={20} className="text-gray-400" />;
  if (mimeType.startsWith('video/')) return <Film size={20} className="text-gray-400" />;
  if (mimeType.startsWith('audio/')) return <Music size={20} className="text-gray-400" />;
  return <FileText size={20} className="text-gray-400" />;
}

function getRoleBadgeColor(role: MediaRole): 'primary' | 'secondary' | 'default' | 'info' | 'success' {
  switch (role) {
    case 'cover':
      return 'primary';
    case 'gallery':
      return 'info';
    case 'avatar':
      return 'secondary';
    case 'thumbnail':
      return 'success';
    default:
      return 'default';
  }
}

export default function MediaPanel({ sourceTable, sourceId }: MediaPanelProps) {
  const { getAttachments, attachMedia, detachMedia } = useCMSMedia();
  const [attachments, setAttachments] = useState<CMSMediaAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detachingId, setDetachingId] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAttachments(sourceTable, sourceId);
      setAttachments(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getAttachments, sourceTable, sourceId]);

  useEffect(() => {
    if (sourceTable && sourceId) {
      loadAttachments();
    }
  }, [sourceTable, sourceId, loadAttachments]);

  const handleMediaSelected = async (media: { id: string }) => {
    setPickerOpen(false);
    setError(null);

    const ok = await attachMedia(media.id, sourceTable, sourceId, 'gallery');
    if (ok) {
      await loadAttachments();
    } else {
      setError('Failed to attach media.');
    }
  };

  const handleDetach = async (attachmentId: string) => {
    setDetachingId(attachmentId);
    setError(null);

    const ok = await detachMedia(attachmentId);
    if (ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } else {
      setError('Failed to detach media.');
    }
    setDetachingId(null);
  };

  const handleRoleChange = async (attachmentId: string, newRole: MediaRole) => {
    setError(null);

    // Optimistic update
    setAttachments((prev) =>
      prev.map((a) => (a.id === attachmentId ? { ...a, media_role: newRole } : a)),
    );

    // Persist to DB
    const { error: updateError } = await api
      .from('cms_media_attachments' as any)
      .update({ media_role: newRole })
      .eq('id', attachmentId);

    if (updateError) {
      setError('Failed to update role.');
      // Revert on failure
      await loadAttachments();
    }
  };

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Paperclip size={16} className="text-gray-500" />
          <Typography variant="subtitle2" fontWeight={600}>
            Media Attachments
          </Typography>
          {attachments.length > 0 && (
            <Chip label={attachments.length} size="small" variant="outlined" />
          )}
        </Stack>
        <Button
          size="small"
          startIcon={<Plus size={14} />}
          onClick={() => setPickerOpen(true)}
        >
          Add media
        </Button>
      </Stack>

      <Box sx={{ p: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && attachments.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <ImageIcon size={32} className="text-gray-300" style={{ margin: '0 auto 8px' }} />
            <Typography variant="body2" color="text.secondary">
              No media attached yet.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Click &ldquo;Add media&rdquo; to attach files.
            </Typography>
          </Box>
        )}

        {!loading && attachments.length > 0 && (
          <Stack spacing={1.5}>
            {attachments.map((attachment) => {
              const media = attachment.media;
              if (!media) return null;

              const isImage = media.mime_type.startsWith('image/');
              const isDetaching = detachingId === attachment.id;

              return (
                <Box
                  key={attachment.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                    opacity: isDetaching ? 0.5 : 1,
                  }}
                >
                  {/* Thumbnail */}
                  {isImage ? (
                    <Box
                      component="img"
                      src={getThumbnailUrl(media.storage_path, media.external_source)}
                      alt={media.alt_text?.en || media.filename}
                      sx={{
                        width: 48,
                        height: 48,
                        objectFit: 'cover',
                        borderRadius: 0.5,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'grey.200',
                        borderRadius: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      {getMimeIcon(media.mime_type)}
                    </Box>
                  )}

                  {/* Info */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Tooltip title={media.original_filename}>
                      <Typography variant="caption" fontWeight={500} noWrap display="block">
                        {media.original_filename}
                      </Typography>
                    </Tooltip>

                    {/* Role selector */}
                    <Select
                      value={attachment.media_role}
                      onChange={(e) =>
                        handleRoleChange(attachment.id, e.target.value as MediaRole)
                      }
                      size="small"
                      variant="standard"
                      disableUnderline
                      sx={{ fontSize: '0.75rem', mt: 0.25 }}
                    >
                      {MEDIA_ROLES.map((r) => (
                        <MenuItem key={r.value} value={r.value} sx={{ fontSize: '0.75rem' }}>
                          {r.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>

                  {/* Role badge */}
                  <Chip
                    label={attachment.media_role}
                    size="small"
                    color={getRoleBadgeColor(attachment.media_role)}
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />

                  {/* Remove button */}
                  <Tooltip title="Remove attachment">
                    <IconButton
                      size="small"
                      onClick={() => handleDetach(attachment.id)}
                      disabled={isDetaching}
                      sx={{ flexShrink: 0 }}
                    >
                      {isDetaching ? (
                        <CircularProgress size={14} />
                      ) : (
                        <Trash2 size={14} className="text-gray-400" />
                      )}
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Media Picker Dialog */}
      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleMediaSelected}
      />
    </Paper>
  );
}

/**
 * MediaPanel
 * Sidebar panel for managing media attachments on a content item.
 * Shows current attachments, allows adding via MediaPickerDialog, and
 * supports per-attachment role selection and removal.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  Loader2,
} from 'lucide-react';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import { supabase } from '@/integrations/supabase/client';
import { updateRow } from '@/hooks/usePageFetchers';
import type { CMSMediaAttachment, MediaRole } from '@/types/cms';
import MediaPickerDialog from '../media/MediaPickerDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const { data } = supabase.storage.from('cms-media').getPublicUrl(storagePath);
  return data.publicUrl;
}

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={20} className="text-gray-400" />;
  if (mimeType.startsWith('video/')) return <Film size={20} className="text-gray-400" />;
  if (mimeType.startsWith('audio/')) return <Music size={20} className="text-gray-400" />;
  return <FileText size={20} className="text-gray-400" />;
}

function getRoleBadgeClass(role: MediaRole): string {
  switch (role) {
    case 'cover':
      return 'border-primary text-primary';
    case 'gallery':
      return 'border-blue-500 text-blue-700';
    case 'avatar':
      return 'border-purple-500 text-purple-700';
    case 'thumbnail':
      return 'border-green-500 text-green-700';
    default:
      return 'border-border text-foreground';
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
    const { error: updateError } = await updateRow('cms_media_attachments', attachmentId, {
      media_role: newRole,
    });

    if (updateError) {
      setError('Failed to update role.');
      // Revert on failure
      await loadAttachments();
    }
  };

  return (
    <div className="border border-border rounded-md bg-background">
      {/* Header */}
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex flex-row items-center gap-1">
          <Paperclip size={16} className="text-gray-500" />
          <p className="text-sm font-semibold">Media Attachments</p>
          {attachments.length > 0 && (
            <Badge variant="outline">{attachments.length}</Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
          <Plus size={14} className="mr-1" />
          Add media
        </Button>
      </div>

      <div className="p-4">
        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription className="flex justify-between items-center">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-xs underline"
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
          </div>
        )}

        {!loading && attachments.length === 0 && (
          <div className="text-center py-8">
            <ImageIcon
              size={32}
              className="text-gray-300"
              style={{ margin: '0 auto 8px' }}
            />
            <p className="text-sm text-muted-foreground">No media attached yet.</p>
            <p className="text-xs text-muted-foreground/70">
              Click &ldquo;Add media&rdquo; to attach files.
            </p>
          </div>
        )}

        {!loading && attachments.length > 0 && (
          <div className="flex flex-col gap-3">
            {attachments.map((attachment) => {
              const media = attachment.media;
              if (!media) return null;

              const isImage = media.mime_type.startsWith('image/');
              const isDetaching = detachingId === attachment.id;

              return (
                <div
                  key={attachment.id}
                  className={`flex items-center gap-3 p-2 rounded border border-border bg-gray-50 ${
                    isDetaching ? 'opacity-50' : ''
                  }`}
                >
                  {/* Thumbnail */}
                  {isImage ? (
                    <img
                      src={getThumbnailUrl(media.storage_path, media.external_source)}
                      alt={media.alt_text?.en || media.filename}
                      className="w-12 h-12 object-cover rounded-sm flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded-sm flex-shrink-0">
                      {getMimeIcon(media.mime_type)}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs font-medium block truncate">
                          {media.original_filename}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>{media.original_filename}</TooltipContent>
                    </Tooltip>

                    {/* Role selector */}
                    <Select
                      value={attachment.media_role}
                      onValueChange={(v) =>
                        handleRoleChange(attachment.id, v as MediaRole)
                      }
                    >
                      <SelectTrigger className="h-7 text-xs mt-1 border-0 bg-transparent shadow-none px-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEDIA_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Role badge */}
                  <Badge
                    variant="outline"
                    className={`text-[0.65rem] h-5 ${getRoleBadgeClass(attachment.media_role)}`}
                  >
                    {attachment.media_role}
                  </Badge>

                  {/* Remove button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDetach(attachment.id)}
                        disabled={isDetaching}
                        className="h-7 w-7 p-0 flex-shrink-0"
                      >
                        {isDetaching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" />
                        ) : (
                          <Trash2 size={14} className="text-gray-400" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove attachment</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Media Picker Dialog */}
      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleMediaSelected}
      />
    </div>
  );
}

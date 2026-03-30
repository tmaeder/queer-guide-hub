/**
 * MediaPickerDialog
 * Reusable dialog for browsing and selecting media items from the CMS media library
 * or from external sources (Pexels, Unsplash, Wikimedia Commons).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tabs,
  Tab,
  Box,
  Typography,
  ImageList,
  ImageListItem,
  CircularProgress,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Pagination,
} from '@mui/material';
import {
  Search,
  Upload,
  X,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  Check,
  Globe,
  FolderOpen,
} from 'lucide-react';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import { supabase } from '@/integrations/supabase/client';
import type { CMSMedia } from '@/types/cms';
import type { ExternalImage } from '@/hooks/useExternalImageSearch';
import MediaUploader from './MediaUploader';
import ExternalImageSearch from './ExternalImageSearch';

interface MediaPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: CMSMedia) => void;
  /** Alternative: just return the URL string (for ImageField/ImagesField) */
  onSelectUrl?: (url: string, attribution?: string) => void;
  /** Filter by MIME type prefix, e.g. "image/" to show only images */
  mimeFilter?: string;
  /** Hint query for external search (e.g., personality name) */
  searchHint?: string;
}

type MimeTab = 'all' | 'image' | 'document' | 'video' | 'audio';
type DialogMode = 'library' | 'external';

const MIME_PREFIXES: Record<MimeTab, string | undefined> = {
  all: undefined,
  image: 'image/',
  document: 'application/',
  video: 'video/',
  audio: 'audio/',
};

const PAGE_SIZE = 24;

function getMediaThumbnailUrl(media: CMSMedia): string {
  // External images store the URL directly in storage_path
  if (media.external_source) {
    return media.storage_path;
  }
  const { data } = supabase.storage.from('cms-media').getPublicUrl(media.storage_path);
  return data.publicUrl;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon size={40} className="text-gray-400" />;
  if (mimeType.startsWith('video/')) return <Film size={40} className="text-gray-400" />;
  if (mimeType.startsWith('audio/')) return <Music size={40} className="text-gray-400" />;
  return <FileText size={40} className="text-gray-400" />;
}

export default function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  onSelectUrl,
  mimeFilter,
  searchHint,
}: MediaPickerDialogProps) {
  const { media, loading, error, totalCount, fetchMedia, importExternalMedia } = useCMSMedia();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<MimeTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showUploader, setShowUploader] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('library');
  const [selectedExternal, setSelectedExternal] = useState<ExternalImage | null>(null);

  // Derive MIME filter from tab or prop
  const effectiveMime = mimeFilter ?? MIME_PREFIXES[activeTab];

  const doFetch = useCallback(() => {
    fetchMedia({
      search: search.trim() || undefined,
      mimeType: effectiveMime,
      page,
      pageSize: PAGE_SIZE,
    });
  }, [fetchMedia, search, effectiveMime, page]);

  useEffect(() => {
    if (open && dialogMode === 'library') {
      doFetch();
    }
  }, [open, doFetch, dialogMode]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSelectedExternal(null);
      setSearch('');
      setPage(1);
      setDialogMode('library');
      setShowUploader(false);
      if (mimeFilter?.startsWith('image/')) {
        setActiveTab('image');
      } else {
        setActiveTab('all');
      }
    }
  }, [open, mimeFilter]);

  const selectedMedia = media.find((m) => m.id === selectedId);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleSelect = async () => {
    if (dialogMode === 'external' && selectedExternal) {
      // External image selected
      if (onSelectUrl) {
        onSelectUrl(
          selectedExternal.url,
          `Photo by ${selectedExternal.photographer} (${selectedExternal.source})`,
        );
        onClose();
      } else {
        // Import into cms_media and return the record
        const imported = await importExternalMedia({
          id: selectedExternal.id,
          url: selectedExternal.url,
          alt: selectedExternal.alt,
          photographer: selectedExternal.photographer,
          photographer_url: selectedExternal.photographer_url,
          source: selectedExternal.source,
          license: selectedExternal.license,
          width: selectedExternal.width,
          height: selectedExternal.height,
        });
        if (imported) {
          onSelect(imported);
          onClose();
        }
      }
    } else if (selectedMedia) {
      // Library media selected
      if (onSelectUrl) {
        onSelectUrl(getMediaThumbnailUrl(selectedMedia));
        onClose();
      } else {
        onSelect(selectedMedia);
        onClose();
      }
    }
  };

  const handleUploaded = (uploaded: CMSMedia) => {
    setShowUploader(false);
    if (onSelectUrl) {
      onSelectUrl(getMediaThumbnailUrl(uploaded));
      onClose();
    } else {
      onSelect(uploaded);
      onClose();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setPage(1);
      doFetch();
    }
  };

  const handleExternalSelect = (image: ExternalImage) => {
    setSelectedExternal(image);
    setSelectedId(null); // Clear library selection
  };

  const hasSelection =
    (dialogMode === 'library' && !!selectedMedia) ||
    (dialogMode === 'external' && !!selectedExternal);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '80vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" component="span">
          Select Media
        </Typography>
        <IconButton onClick={onClose} size="small">
          <X size={20} />
        </IconButton>
      </DialogTitle>

      {/* Top-level mode tabs: Library / External Sources */}
      <Box sx={{ px: 3, pb: 0 }}>
        <Tabs
          value={dialogMode}
          onChange={(_, v) => {
            setDialogMode(v as DialogMode);
            setSelectedId(null);
            setSelectedExternal(null);
          }}
          sx={{ minHeight: 40, mb: 1.5 }}
        >
          <Tab
            icon={<FolderOpen size={14} />}
            iconPosition="start"
            label="Media Library"
            value="library"
            sx={{ minHeight: 40, py: 0 }}
          />
          <Tab
            icon={<Globe size={14} />}
            iconPosition="start"
            label="External Sources"
            value="external"
            sx={{ minHeight: 40, py: 0 }}
          />
        </Tabs>
      </Box>

      {/* Library mode */}
      {dialogMode === 'library' && (
        <>
          <Box sx={{ px: 3, pb: 1 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                slotProps={{
                  input: {
                    startAdornment: <Search size={16} className="text-gray-400 mr-2" />,
                  },
                }}
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<Upload size={16} />}
                onClick={() => setShowUploader(!showUploader)}
              >
                Upload
              </Button>
            </Stack>

            {showUploader && (
              <Box sx={{ mb: 2 }}>
                <MediaUploader
                  onUploaded={handleUploaded}
                  accept={mimeFilter ? `${mimeFilter}*` : undefined}
                />
              </Box>
            )}

            {!mimeFilter && (
              <Tabs
                value={activeTab}
                onChange={(_, v) => {
                  setActiveTab(v as MimeTab);
                  setPage(1);
                }}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 36 }}
              >
                <Tab label="All" value="all" sx={{ minHeight: 36, py: 0 }} />
                <Tab icon={<ImageIcon size={14} />} iconPosition="start" label="Images" value="image" sx={{ minHeight: 36, py: 0 }} />
                <Tab icon={<FileText size={14} />} iconPosition="start" label="Documents" value="document" sx={{ minHeight: 36, py: 0 }} />
                <Tab icon={<Film size={14} />} iconPosition="start" label="Video" value="video" sx={{ minHeight: 36, py: 0 }} />
                <Tab icon={<Music size={14} />} iconPosition="start" label="Audio" value="audio" sx={{ minHeight: 36, py: 0 }} />
              </Tabs>
            )}
          </Box>

          <DialogContent dividers sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            )}

            {!loading && media.length === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
                <ImageIcon size={48} className="text-gray-300 mb-2" />
                <Typography variant="body2" color="text.secondary">
                  No media found. Upload a file or search external sources.
                </Typography>
                <Button
                  size="small"
                  sx={{ mt: 1 }}
                  onClick={() => setDialogMode('external')}
                  startIcon={<Globe size={14} />}
                >
                  Browse External Sources
                </Button>
              </Box>
            )}

            {!loading && media.length > 0 && (
              <ImageList cols={4} gap={12} sx={{ m: 0 }}>
                {media.map((item) => {
                  const isSelected = selectedId === item.id;
                  const isImage = item.mime_type.startsWith('image/');

                  return (
                    <ImageListItem
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectedExternal(null);
                      }}
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        overflow: 'hidden',
                        border: 2,
                        borderColor: isSelected ? 'primary.main' : 'transparent',
                        position: 'relative',
                        '&:hover': {
                          borderColor: isSelected ? 'primary.main' : 'action.hover',
                        },
                        bgcolor: 'grey.50',
                      }}
                    >
                      {isImage ? (
                        <img
                          src={getMediaThumbnailUrl(item)}
                          alt={item.alt_text?.en || item.filename}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: 160,
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: '100%',
                            height: 160,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'grey.100',
                          }}
                        >
                          {getMimeIcon(item.mime_type)}
                        </Box>
                      )}

                      {isSelected && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            bgcolor: 'primary.main',
                            borderRadius: '50%',
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Check size={14} color="white" />
                        </Box>
                      )}

                      {/* External source badge */}
                      {item.external_source && (
                        <Chip
                          label={item.external_source}
                          size="small"
                          sx={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            textTransform: 'capitalize',
                          }}
                        />
                      )}

                      <Box sx={{ p: 1 }}>
                        <Tooltip title={item.original_filename}>
                          <Typography
                            variant="caption"
                            noWrap
                            display="block"
                            sx={{ fontWeight: 500 }}
                          >
                            {item.original_filename}
                          </Typography>
                        </Tooltip>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="caption" color="text.secondary">
                            {formatFileSize(item.file_size)}
                          </Typography>
                          {item.width && item.height && (
                            <Typography variant="caption" color="text.secondary">
                              {' '}
                              &middot; {item.width}&times;{item.height}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    </ImageListItem>
                  );
                })}
              </ImageList>
            )}
          </DialogContent>

          <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              {totalCount} item{totalCount !== 1 ? 's' : ''}
            </Typography>
            {totalPages > 1 && (
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, p) => setPage(p)}
                size="small"
              />
            )}
          </Box>
        </>
      )}

      {/* External sources mode */}
      {dialogMode === 'external' && (
        <DialogContent dividers sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          <ExternalImageSearch
            onSelect={handleExternalSelect}
            initialQuery={searchHint || ''}
          />
        </DialogContent>
      )}

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSelect}
          variant="contained"
          disabled={!hasSelection}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  );
}

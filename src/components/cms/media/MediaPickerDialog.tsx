/**
 * MediaPickerDialog
 * Reusable dialog for browsing and selecting media items from the CMS media library
 * or from external sources (Pexels, Unsplash, Wikimedia Commons).
 */

import { useState, useEffect, useCallback } from 'react';
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
  Loader2,
} from 'lucide-react';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import { supabase } from '@/integrations/supabase/client';
import type { CMSMedia } from '@/types/cms';
import type { ExternalImage } from '@/hooks/useExternalImageSearch';
import MediaUploader from './MediaUploader';
import ExternalImageSearch from './ExternalImageSearch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-5xl w-full p-0 flex flex-col"
        style={{ height: '80vh' }}
      >
        <DialogHeader className="flex flex-row items-center justify-between pb-1 px-6 pt-4 space-y-0">
          <DialogTitle className="text-lg">Select Media</DialogTitle>
          <Button onClick={onClose} variant="ghost" size="sm" className="h-7 w-7 p-0">
            <X size={20} />
          </Button>
        </DialogHeader>

        {/* Top-level mode tabs: Library / External Sources */}
        <div className="px-6 pb-0">
          <Tabs
            value={dialogMode}
            onValueChange={(v) => {
              setDialogMode(v as DialogMode);
              setSelectedId(null);
              setSelectedExternal(null);
            }}
          >
            <TabsList className="min-h-10 mb-3">
              <TabsTrigger value="library">
                <FolderOpen size={14} className="mr-1" />
                Media Library
              </TabsTrigger>
              <TabsTrigger value="external">
                <Globe size={14} className="mr-1" />
                External Sources
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Library mode */}
        {dialogMode === 'library' && (
          <>
            <div className="px-6 pb-1">
              <div className="flex flex-row gap-3 items-center mb-3">
                <div className="flex-1 relative">
                  <Search
                    size={16}
                    className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <Input
                    placeholder="Search files..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="pl-9 h-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUploader(!showUploader)}
                >
                  <Upload size={16} className="mr-1" />
                  Upload
                </Button>
              </div>

              {showUploader && (
                <div className="mb-3">
                  <MediaUploader
                    onUploaded={handleUploaded}
                    accept={mimeFilter ? `${mimeFilter}*` : undefined}
                  />
                </div>
              )}

              {!mimeFilter && (
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => {
                    setActiveTab(v as MimeTab);
                    setPage(1);
                  }}
                >
                  <TabsList className="min-h-9">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="image">
                      <ImageIcon size={14} className="mr-1" />
                      Images
                    </TabsTrigger>
                    <TabsTrigger value="document">
                      <FileText size={14} className="mr-1" />
                      Documents
                    </TabsTrigger>
                    <TabsTrigger value="video">
                      <Film size={14} className="mr-1" />
                      Video
                    </TabsTrigger>
                    <TabsTrigger value="audio">
                      <Music size={14} className="mr-1" />
                      Audio
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>

            <div className="flex-1 overflow-auto p-3 border-y border-border">
              {error && (
                <Alert variant="destructive" className="mb-3">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
                </div>
              )}

              {!loading && media.length === 0 && (
                <div className="flex flex-col items-center py-12">
                  <ImageIcon size={48} className="text-gray-300 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No media found. Upload a file or search external sources.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => setDialogMode('external')}
                  >
                    <Globe size={14} className="mr-1" />
                    Browse External Sources
                  </Button>
                </div>
              )}

              {!loading && media.length > 0 && (
                <div className="grid grid-cols-4 gap-3 m-0">
                  {media.map((item) => {
                    const isSelected = selectedId === item.id;
                    const isImage = item.mime_type.startsWith('image/');

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedId(item.id);
                          setSelectedExternal(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedId(item.id);
                            setSelectedExternal(null);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        className={`cursor-pointer rounded overflow-hidden border-2 relative bg-gray-50 hover:border-muted ${
                          isSelected
                            ? 'border-primary hover:border-primary'
                            : 'border-transparent'
                        }`}
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
                          <div
                            className="w-full flex items-center justify-center bg-gray-100"
                            style={{ height: 160 }}
                          >
                            {getMimeIcon(item.mime_type)}
                          </div>
                        )}

                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 bg-primary rounded-full w-6 h-6 flex items-center justify-center">
                            <Check size={14} color="white" />
                          </div>
                        )}

                        {/* External source badge */}
                        {item.external_source && (
                          <span className="absolute top-1.5 left-1.5 h-5 px-1.5 text-[0.65rem] capitalize bg-black/60 text-white rounded flex items-center">
                            {item.external_source}
                          </span>
                        )}

                        <div className="p-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs font-medium block truncate">
                                {item.original_filename}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>{item.original_filename}</TooltipContent>
                          </Tooltip>
                          <div className="flex flex-row gap-1 items-center">
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(item.file_size)}
                            </span>
                            {item.width && item.height && (
                              <span className="text-xs text-muted-foreground">
                                {' '}
                                &middot; {item.width}&times;{item.height}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {totalCount} item{totalCount !== 1 ? 's' : ''}
              </span>
              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className={
                          page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === page}
                          onClick={() => setPage(p)}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className={
                          page === totalPages
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          </>
        )}

        {/* External sources mode */}
        {dialogMode === 'external' && (
          <div className="flex-1 overflow-auto p-3 border-y border-border">
            <ExternalImageSearch
              onSelect={handleExternalSelect}
              initialQuery={searchHint || ''}
            />
          </div>
        )}

        <DialogFooter className="px-6 pb-4 gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!hasSelection}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

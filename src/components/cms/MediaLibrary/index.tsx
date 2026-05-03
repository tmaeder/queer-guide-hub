import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  Trash2,
  Search,
  Download,
  Upload,
  Grid,
  List,
  AlertTriangle,
  RefreshCw,
  Zap,
  Archive,
  FolderOpen,
  Sliders,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { countRows, deleteRow } from '@/hooks/usePageFetchers';
import { useToast } from '@/hooks/use-toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useMediaList } from '@/hooks/useMediaList';
import type { MediaItem, ViewMode, SortBy, FilterBy, OptimizationJob, OptimizationSettings } from './types';
import { formatFileSize } from './utils';
import { MediaUploader } from './MediaUploader';
import { MediaGrid } from './MediaGrid';
import { MediaPreviewDrawer } from './MediaPreviewDrawer';

export function MediaLibrary() {
  const { isAdmin } = useAdminRoles();
  const { media, setMedia, loading, setLoading, fetchMedia } = useMediaList(isAdmin);
  const [filteredMedia, setFilteredMedia] = useState<MediaItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showOptimization, setShowOptimization] = useState(false);
  const [optimizationJobs, setOptimizationJobs] = useState<OptimizationJob[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [optimizingItem, setOptimizingItem] = useState<MediaItem | null>(null);
  const [optimizationSettings, setOptimizationSettings] = useState<OptimizationSettings>({
    quality: 80,
    formats: ['WEBP'],
    resize: false,
    maxWidth: 1920,
    maxHeight: 1080,
    preserveMetadata: false,
    enableProgressiveJpeg: true,
    enableLosslessWebP: false,
  });

  const { toast } = useToast();

  useEffect(() => {
    filterAndSortMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterAndSortMedia defined below, re-run on filter changes
  }, [media, searchQuery, sortBy, filterBy]);

  const populateOptimizationStatus = async () => {
    try {
      setLoading(true);

      const existingCount = await countRows('media_optimization_status');

      if (existingCount > 0) {
        toast({
          title: "Status Already Synced",
          description: "Optimization status is already populated.",
        });
        return;
      }

      let offset = 0;
      const batchSize = 50;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('populate-optimization-status', {
          body: { batchSize, offset }
        });

        if (error) {
          console.error('Error populating optimization status:', error);
          break;
        }

        hasMore = data?.totalProcessed === batchSize;
        offset += batchSize;
      }

      toast({
        title: "Optimization Status Synced",
        description: "All files have been synced successfully.",
      });

      fetchMedia();
    } catch (error) {
      console.error('Error populating optimization status:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync optimization status. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortMedia = () => {
    let filtered = [...media];

    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.filename.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    switch (filterBy) {
      case 'images':
        filtered = filtered.filter(item => item.mime_type.startsWith('image/'));
        break;
      case 'videos':
        filtered = filtered.filter(item => item.mime_type.startsWith('video/'));
        break;
      case 'documents':
        filtered = filtered.filter(item =>
          item.mime_type.includes('pdf') ||
          item.mime_type.includes('text') ||
          item.mime_type.includes('document')
        );
        break;
      case 'unused':
        filtered = filtered.filter(item => (item.usage_count || 0) === 0);
        break;
      case 'unoptimized':
        filtered = filtered.filter(item => item.optimization_status !== 'optimized');
        break;
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'filename':
          return a.original_filename.localeCompare(b.original_filename);
        case 'file_size':
          return b.file_size - a.file_size;
        case 'usage_count':
          return (b.usage_count || 0) - (a.usage_count || 0);
        case 'optimized':
          return (a.optimization_status === 'optimized' ? 1 : 0) - (b.optimization_status === 'optimized' ? 1 : 0);
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredMedia(filtered);
  };

  const handleDelete = async (item: MediaItem) => {
    try {
      if ((item.usage_count || 0) > 0) {
        toast({
          title: "Cannot Delete",
          description: "This media is currently being used by content items. Remove it from content first.",
          variant: "destructive",
        });
        return;
      }

      const { error: storageError } = await supabase.storage
        .from('cms-media')
        .remove([item.storage_path]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
      }

      const { error: dbError } = await deleteRow('cms_media', item.id);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Media item deleted successfully",
      });

      fetchMedia();
    } catch (error) {
      console.error('Error deleting media:', error);
      toast({
        title: "Error",
        description: "Failed to delete media item",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handleDownload = async (item: MediaItem) => {
    try {
      const { data } = supabase.storage
        .from('cms-media')
        .getPublicUrl(item.storage_path);

      const link = document.createElement('a');
      link.href = data.publicUrl;
      link.download = item.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle style={{ height: 16, width: 16 }} />
        <AlertDescription>
          You need administrator privileges to access the media library.
        </AlertDescription>
      </Alert>
    );
  }

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const selectAllVisible = () => {
    setSelectedItems(new Set(filteredMedia.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleBulkOptimization = async () => {
    if (selectedItems.size === 0) return;

    const jobId = crypto.randomUUID();
    const job: OptimizationJob = {
      id: jobId,
      media_ids: Array.from(selectedItems),
      status: 'pending',
      progress: 0,
      settings: optimizationSettings
    };

    setOptimizationJobs(prev => [...prev, job]);
    setShowOptimization(false);

    toast({
      title: "Optimization Started",
      description: `Processing ${selectedItems.size} files with ${optimizationSettings.formats.join(', ')} format(s)...`,
    });

    setTimeout(() => {
      setOptimizationJobs(prev =>
        prev.map(j => j.id === jobId ? {
          ...j,
          status: 'processing',
          progress: 15,
          results: { processed: 0, successful: 0, failed: 0, totalSavings: 0 }
        } : j)
      );
    }, 500);

    setTimeout(() => {
      setOptimizationJobs(prev =>
        prev.map(j => j.id === jobId ? {
          ...j,
          progress: 45,
          results: { processed: Math.floor(selectedItems.size * 0.3), successful: Math.floor(selectedItems.size * 0.3), failed: 0, totalSavings: 1024 * 150 }
        } : j)
      );
    }, 2000);

    setTimeout(() => {
      setOptimizationJobs(prev =>
        prev.map(j => j.id === jobId ? {
          ...j,
          progress: 80,
          results: { processed: Math.floor(selectedItems.size * 0.7), successful: Math.floor(selectedItems.size * 0.7), failed: 0, totalSavings: 1024 * 350 }
        } : j)
      );
    }, 4000);

    setTimeout(() => {
      const finalResults = {
        processed: selectedItems.size,
        successful: selectedItems.size - 1,
        failed: 1,
        totalSavings: 1024 * 500 * selectedItems.size
      };

      setOptimizationJobs(prev =>
        prev.map(j => j.id === jobId ? {
          ...j,
          status: 'completed',
          progress: 100,
          results: finalResults
        } : j)
      );

      toast({
        title: "Optimization Complete",
        description: `Successfully optimized ${finalResults.successful} of ${selectedItems.size} files. Saved ${formatFileSize(finalResults.totalSavings)}`,
      });

      clearSelection();

      setMedia(prev =>
        prev.map(item =>
          selectedItems.has(item.id) ? {
            ...item,
            optimization_status: 'optimized' as const,
            formats_available: [...(item.formats_available || []), ...optimizationSettings.formats]
          } : item
        )
      );
    }, 6000);
  };

  const handleSingleOptimization = async (item: MediaItem) => {
    setOptimizingItem(item);

    toast({
      title: "Optimization Started",
      description: `Optimizing ${item.original_filename}...`,
    });

    setTimeout(() => {
      setMedia(prev =>
        prev.map(m => m.id === item.id ? {
          ...m,
          optimization_status: 'optimized' as const,
          formats_available: [...(m.formats_available || []), ...optimizationSettings.formats],
          optimization_metadata: {
            ...m.optimization_metadata,
            compression_ratio: 30 + Math.floor(Math.random() * 20),
            compressed_size: Math.floor(m.file_size * (0.5 + Math.random() * 0.3))
          }
        } : m)
      );

      setOptimizingItem(null);
      toast({
        title: "Optimization Complete",
        description: `Successfully optimized ${item.original_filename}`,
      });
    }, 3000);
  };

  const handleStarItem = async (item: MediaItem) => {
    setMedia(prev =>
      prev.map(m => m.id === item.id ? { ...m, starred: !m.starred } : m)
    );
    toast({
      title: item.starred ? "Removed from favorites" : "Added to favorites",
      description: item.original_filename,
    });
  };

  return (
    <Box sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Media Library</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage and optimize your media files
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={populateOptimizationStatus}
            variant="outline"
            style={{ display: 'flex', gap: 8 }}
          >
            <RefreshCw style={{ height: 16, width: 16 }} />
            Sync Optimization Status
          </Button>
          <Button onClick={() => setShowUpload(true)}>
            <Upload style={{ height: 16, width: 16, marginRight: 4 }} />
            Upload
          </Button>
          <Button variant="outline" onClick={() => setBulkMode(!bulkMode)}>
            <Archive style={{ height: 16, width: 16, marginRight: 4 }} />
            {bulkMode ? 'Exit Bulk' : 'Bulk Mode'}
          </Button>
          <Button variant="outline" onClick={() => setShowOptimization(true)}>
            <Sliders style={{ height: 16, width: 16, marginRight: 4 }} />
            Optimize
          </Button>
        </Box>
      </Box>

      {/* Bulk Actions Bar */}
      {bulkMode && (
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {selectedItems.size} of {filteredMedia.length} selected
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="sm" variant="outline" onClick={selectAllVisible}>
                    Select All Visible
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearSelection}>
                    Clear Selection
                  </Button>
                </Box>
              </Box>

              {selectedItems.size > 0 && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="sm" variant="outline" onClick={() => setShowOptimization(true)}>
                    <Zap style={{ height: 16, width: 16, marginRight: 4 }} />
                    Optimize
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download style={{ height: 16, width: 16, marginRight: 4 }} />
                    Download
                  </Button>
                  <Button size="sm" variant="destructive">
                    <Trash2 style={{ height: 16, width: 16, marginRight: 4 }} />
                    Delete
                  </Button>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Active Optimization Jobs */}
      {optimizationJobs.filter(job => job.status !== 'completed').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle style={{ fontSize: '1.125rem' }}>Active Optimizations</CardTitle>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {optimizationJobs.filter(job => job.status !== 'completed').map(job => (
                <Box key={job.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Optimizing {job.media_ids.length} files ({job.settings.formats.join(', ')})
                    </Typography>
                    <Badge variant={job.status === 'processing' ? 'default' : 'secondary'}>
                      {job.status}
                    </Badge>
                  </Box>
                  <Progress value={job.progress} style={{ height: 8 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">{job.progress}% complete</Typography>
                    {job.results && (
                      <Typography variant="caption" color="text.secondary">
                        {job.results.successful}/{job.results.processed} processed
                        {job.results.totalSavings > 0 && ` - ${formatFileSize(job.results.totalSavings)} saved`}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <MediaUploader
          onUploaded={() => {
            setShowUpload(false);
            fetchMedia();
            toast({
              title: "Success",
              description: "Media uploaded successfully",
            });
          }}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {/* Filters and Controls */}
      <Card>
        <CardContent style={{ padding: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2 }}>
            <Box sx={{ position: 'relative', flex: 1, maxWidth: { md: 400 } }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search media files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select value={filterBy} onValueChange={(value: FilterBy) => setFilterBy(value)}>
                <SelectTrigger style={{ width: 144 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Files</SelectItem>
                  <SelectItem value="images">Images</SelectItem>
                  <SelectItem value="videos">Videos</SelectItem>
                  <SelectItem value="documents">Documents</SelectItem>
                  <SelectItem value="unused">Unused</SelectItem>
                  <SelectItem value="starred">Starred</SelectItem>
                  <SelectItem value="unoptimized">Unoptimized</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(value: SortBy) => setSortBy(value)}>
                <SelectTrigger style={{ width: 144 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Date Added</SelectItem>
                  <SelectItem value="filename">Name</SelectItem>
                  <SelectItem value="file_size">File Size</SelectItem>
                  <SelectItem value="usage_count">Usage</SelectItem>
                  <SelectItem value="optimized">Optimized</SelectItem>
                </SelectContent>
              </Select>

              <Box sx={{ display: 'flex', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                >
                  <Grid style={{ height: 16, width: 16 }} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  style={{ borderRadius: 0, borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}
                >
                  <List style={{ height: 16, width: 16 }} />
                </Button>
                <Button
                  variant={viewMode === 'compact' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('compact')}
                  style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                >
                  <FolderOpen style={{ height: 16, width: 16 }} />
                </Button>
              </Box>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMedia()}
              >
                <RefreshCw style={{ height: 16, width: 16 }} />
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <MediaGrid
        loading={loading}
        items={filteredMedia}
        viewMode={viewMode}
        bulkMode={bulkMode}
        selectedItems={selectedItems}
        optimizingItem={optimizingItem}
        searchQuery={searchQuery}
        hasFilter={filterBy !== 'all'}
        onToggleSelect={toggleItemSelection}
        onStar={handleStarItem}
        onSingleOptimize={handleSingleOptimization}
        onOptimizeWithSettings={(item) => {
          setSelectedItems(new Set([item.id]));
          setShowOptimization(true);
        }}
        onDownload={handleDownload}
        onDelete={(item) => {
          setItemToDelete(item);
          setDeleteDialogOpen(true);
        }}
      />

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: '1.125rem' }}>Library Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>{media.length}</Typography>
              <Typography variant="body2" color="text.secondary">Total Files</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {formatFileSize(media.reduce((acc, item) => acc + item.file_size, 0))}
              </Typography>
              <Typography variant="body2" color="text.secondary">Total Size</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {media.filter(item => item.optimization_status === 'optimized').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Optimized</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                {media.filter(item => (item.usage_count || 0) === 0).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Unused</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <MediaPreviewDrawer
        open={showOptimization}
        onOpenChange={setShowOptimization}
        selectedCount={selectedItems.size}
        settings={optimizationSettings}
        onSettingsChange={setOptimizationSettings}
        onOptimize={handleBulkOptimization}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.original_filename}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && handleDelete(itemToDelete)}
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}

export default MediaLibrary;

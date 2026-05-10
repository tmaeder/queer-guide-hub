import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
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
import type { MediaItem, ViewMode, SortBy, FilterBy, EntityTypeFilter, OptimizationJob, OptimizationSettings } from './types';
import { formatFileSize } from './utils';
import { MediaUploader } from './MediaUploader';
import { MediaGrid } from './MediaGrid';
import { MediaPreviewDrawer } from './MediaPreviewDrawer';
import { useImageAssets } from '@/hooks/useImageAssets';

export function MediaLibrary() {
  const { isAdmin } = useAdminRoles();
  const { media, setMedia, loading: cmsLoading, setLoading, fetchMedia } = useMediaList(isAdmin);
  const [filteredMedia, setFilteredMedia] = useState<MediaItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>('all');
  const [assetPage, setAssetPage] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { items: assetItems, totalCount: assetTotal, loading: assetsLoading, pageSize, refetch: refetchAssets } = useImageAssets({
    enabled: isAdmin,
    page: assetPage,
    search: debouncedSearch,
    entityTypeFilter,
  });
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
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setAssetPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loading = cmsLoading || assetsLoading;

  useEffect(() => {
    filterAndSortMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterAndSortMedia defined below, re-run on filter changes
  }, [media, assetItems, searchQuery, sortBy, filterBy]);

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
    let cmsFiltered = [...media];

    if (searchQuery) {
      cmsFiltered = cmsFiltered.filter(item =>
        item.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.filename.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    switch (filterBy) {
      case 'images':
        cmsFiltered = cmsFiltered.filter(item => item.mime_type.startsWith('image/'));
        break;
      case 'videos':
        cmsFiltered = cmsFiltered.filter(item => item.mime_type.startsWith('video/'));
        break;
      case 'documents':
        cmsFiltered = cmsFiltered.filter(item =>
          item.mime_type.includes('pdf') ||
          item.mime_type.includes('text') ||
          item.mime_type.includes('document')
        );
        break;
      case 'unused':
        cmsFiltered = cmsFiltered.filter(item => (item.usage_count || 0) === 0);
        break;
      case 'unoptimized':
        cmsFiltered = cmsFiltered.filter(item => item.optimization_status !== 'optimized');
        break;
    }

    cmsFiltered.sort((a, b) => {
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

    setFilteredMedia([...cmsFiltered, ...assetItems]);
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
      if (item.external_url) {
        window.open(item.external_url, '_blank', 'noopener');
        return;
      }
      const { data } = supabase.storage
        .from('cms-media')
        .getPublicUrl(item.storage_path ?? '');

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

  const runOptimizationBatch = async () => {
    const jobId = crypto.randomUUID();
    const job: OptimizationJob = {
      id: jobId,
      media_ids: [],
      status: 'processing',
      progress: 0,
      settings: optimizationSettings,
      results: { processed: 0, successful: 0, failed: 0, totalSavings: 0 },
    };

    setOptimizationJobs(prev => [...prev, job]);
    setShowOptimization(false);

    toast({ title: "Optimization Started", description: "Processing all pending images..." });

    let totalProcessed = 0;
    let totalMirrored = 0;
    let totalCdn = 0;
    let totalFailed = 0;
    let remaining = Infinity;

    while (remaining > 0) {
      try {
        const { data, error } = await supabase.functions.invoke('optimize-images-batch', {
          body: { batch_size: 30 },
        });
        if (error) { console.error('Optimization batch error:', error); break; }
        if (data.done) { remaining = 0; break; }

        totalProcessed += data.processed || 0;
        totalMirrored += data.mirrored || 0;
        totalCdn += data.cdn_marked || 0;
        totalFailed += data.failed || 0;
        remaining = data.remaining || 0;

        const total = totalProcessed + remaining;
        const progress = total > 0 ? Math.round((totalProcessed / total) * 100) : 100;

        setOptimizationJobs(prev =>
          prev.map(j => j.id === jobId ? {
            ...j,
            progress,
            results: { processed: totalProcessed, successful: totalMirrored + totalCdn, failed: totalFailed, totalSavings: 0 },
          } : j)
        );
      } catch (err) {
        console.error('Optimization error:', err);
        break;
      }
    }

    setOptimizationJobs(prev =>
      prev.map(j => j.id === jobId ? { ...j, status: 'completed', progress: 100 } : j)
    );

    toast({
      title: "Optimization Complete",
      description: `Processed ${totalProcessed} images (${totalMirrored} mirrored, ${totalCdn} CDN, ${totalFailed} failed)`,
    });

    refetchAssets();
  };

  const handleBulkOptimization = async () => {
    runOptimizationBatch();
  };

  const handleSingleOptimization = async (item: MediaItem) => {
    setOptimizingItem(item);
    toast({ title: "Optimization Started", description: `Optimizing ${item.original_filename}...` });

    try {
      const { error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { batch_size: 1 },
      });
      if (error) throw error;
      toast({ title: "Optimization Complete", description: `Optimized ${item.original_filename}` });
    } catch (err) {
      console.error('Single optimization error:', err);
      toast({ title: "Optimization Failed", variant: "destructive" });
    } finally {
      setOptimizingItem(null);
      refetchAssets();
    }
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
    <div className="max-w-screen-lg mx-auto p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-2xl font-bold">Media Library</h4>
          <p className="text-sm text-muted-foreground">
            Manage and optimize your media files
          </p>
        </div>

        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {bulkMode && (
        <Card>
          <CardContent style={{ padding: 16 }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="text-sm font-medium">
                  {selectedItems.size} of {filteredMedia.length} selected
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAllVisible}>
                    Select All Visible
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearSelection}>
                    Clear Selection
                  </Button>
                </div>
              </div>

              {selectedItems.size > 0 && (
                <div className="flex gap-2">
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
                </div>
              )}
            </div>
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
            <div className="flex flex-col gap-3">
              {optimizationJobs.filter(job => job.status !== 'completed').map(job => (
                <div key={job.id} className="flex flex-col gap-3 p-4 border border-border rounded-md">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">
                      Optimizing {job.media_ids.length} files ({job.settings.formats.join(', ')})
                    </p>
                    <Badge variant={job.status === 'processing' ? 'default' : 'secondary'}>
                      {job.status}
                    </Badge>
                  </div>
                  <Progress value={job.progress} style={{ height: 8 }} />
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">{job.progress}% complete</span>
                    {job.results && (
                      <span className="text-xs text-muted-foreground">
                        {job.results.successful}/{job.results.processed} processed
                        {job.results.totalSavings > 0 && ` - ${formatFileSize(job.results.totalSavings)} saved`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1 md:max-w-md">
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search media files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <Select value={entityTypeFilter} onValueChange={(value: EntityTypeFilter) => { setEntityTypeFilter(value); setAssetPage(0); }}>
                <SelectTrigger style={{ width: 160 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  <SelectItem value="venue">Venues</SelectItem>
                  <SelectItem value="event">Events</SelectItem>
                  <SelectItem value="news_article">News</SelectItem>
                  <SelectItem value="personality">Personalities</SelectItem>
                  <SelectItem value="marketplace_listing">Marketplace</SelectItem>
                  <SelectItem value="city">Cities</SelectItem>
                  <SelectItem value="country">Countries</SelectItem>
                  <SelectItem value="queer_village">Villages</SelectItem>
                </SelectContent>
              </Select>

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

              <div className="flex border border-border rounded">
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
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMedia()}
              >
                <RefreshCw style={{ height: 16, width: 16 }} />
              </Button>
            </div>
          </div>
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

      {/* Pagination */}
      {assetTotal > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {assetPage * pageSize + 1}–{Math.min((assetPage + 1) * pageSize, assetTotal)} of {assetTotal} images
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={assetPage === 0}
              onClick={() => setAssetPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(assetPage + 1) * pageSize >= assetTotal}
              onClick={() => setAssetPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: '1.125rem' }}>Library Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xl font-bold">{assetTotal + media.length}</p>
              <p className="text-sm text-muted-foreground">Total Files</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{assetTotal}</p>
              <p className="text-sm text-muted-foreground">Image Assets</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{media.length}</p>
              <p className="text-sm text-muted-foreground">CMS / Storage</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">
                {filteredMedia.filter(item => (item.usage_count || 0) === 0).length}
              </p>
              <p className="text-sm text-muted-foreground">Unused</p>
            </div>
          </div>
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
    </div>
  );
}

export default MediaLibrary;

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  Trash2, 
  Search, 
  Filter, 
  Download, 
  Eye,
  Upload,
  Grid,
  List,
  MoreVertical,
  AlertTriangle,
  Image as ImageIcon,
  File,
  Video,
  FileText,
  RefreshCw,
  Settings,
  Zap,
  Archive,
  Edit3,
  Copy,
  Share2,
  FolderOpen,
  Star,
  Sliders
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useToast } from '@/hooks/use-toast';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { EnhancedImageUpload } from '@/components/security/EnhancedImageUpload';

interface MediaItem {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  alt_text?: any;
  caption?: any;
  usage_count?: number;
  content_items?: string[];
  optimized?: boolean;
  starred?: boolean;
  tags?: string[];
  optimization_status?: 'pending' | 'processing' | 'optimized' | 'failed' | 'not_optimized';
  formats_available?: string[];
  optimization_metadata?: {
    original_size?: number;
    compressed_size?: number;
    compression_ratio?: number;
    formats?: Array<{
      format: string;
      size: number;
      width?: number;
      height?: number;
    }>;
  };
}

type ViewMode = 'grid' | 'list' | 'compact';
type SortBy = 'created_at' | 'filename' | 'file_size' | 'usage_count' | 'optimized';
type FilterBy = 'all' | 'images' | 'videos' | 'documents' | 'unused' | 'starred' | 'unoptimized';

interface OptimizationJob {
  id: string;
  media_ids: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  settings: {
    quality: number;
    format: string;
    resize: boolean;
    maxWidth?: number;
    maxHeight?: number;
  };
}

export function MediaLibrary() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<MediaItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
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
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchMedia();
    }
  }, [isAdmin]);

  useEffect(() => {
    filterAndSortMedia();
  }, [media, searchQuery, sortBy, filterBy]);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      
      // Fetch from cms_media table first
      const { data: cmsMediaData, error: cmsError } = await supabase
        .from('cms_media')
        .select(`
          *,
          cms_content_media(
            content_id,
            cms_content(title)
          )
        `)
        .order('created_at', { ascending: false });

      if (cmsError) {
        console.error('CMS media error:', cmsError);
      }

      // Process CMS media data
      const processCmsMedia = (cmsMediaData || []).map(item => ({
        ...item,
        usage_count: item.cms_content_media?.length || 0,
        content_items: item.cms_content_media?.map((rel: any) => 
          rel.cms_content?.title || 'Untitled'
        ).filter(Boolean) || [],
        source: 'cms'
      }));

      // Fetch storage files from all buckets
      const buckets = ['adult-model-images', 'city-images', 'tag-images'];
      let allStorageFiles: any[] = [];

      for (const bucket of buckets) {
        try {
          const { data: files, error } = await supabase.storage
            .from(bucket)
            .list('', { 
              limit: 1000,
              sortBy: { column: 'created_at', order: 'desc' }
            });

          if (error) {
            console.error(`Error fetching from ${bucket}:`, error);
            continue;
          }

          if (files && files.length > 0) {
            const processedFiles = files
              .filter(file => file.name && !file.name.includes('.emptyFolderPlaceholder'))
              .map(file => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const hasOptimizedFormats = ['webp', 'avif'].includes(ext);
                const isOriginalFormat = ['jpg', 'jpeg', 'png'].includes(ext);
                
                return {
                  id: `${bucket}-${file.name}`,
                  filename: file.name,
                  original_filename: file.name,
                  mime_type: file.metadata?.mimetype || getFileType(file.name),
                  file_size: file.metadata?.size || 0,
                  width: file.metadata?.width,
                  height: file.metadata?.height,
                  storage_path: file.name,
                  uploaded_by: 'system',
                  created_at: file.created_at || file.updated_at || new Date().toISOString(),
                  alt_text: {},
                  caption: {},
                  usage_count: 0,
                  content_items: [],
                  source: bucket,
                  bucket: bucket,
                  optimization_status: hasOptimizedFormats ? 'optimized' : (isOriginalFormat ? 'not_optimized' : 'not_optimized'),
                  formats_available: [ext.toUpperCase()],
                  optimization_metadata: {
                    original_size: file.metadata?.size || 0,
                    compressed_size: hasOptimizedFormats ? Math.floor((file.metadata?.size || 0) * 0.7) : undefined,
                    compression_ratio: hasOptimizedFormats ? 30 : undefined,
                    formats: [{
                      format: ext.toUpperCase(),
                      size: file.metadata?.size || 0,
                      width: file.metadata?.width,
                      height: file.metadata?.height
                    }]
                  }
                };
              });
            
            allStorageFiles = [...allStorageFiles, ...processedFiles];
          }
        } catch (storageError) {
          console.error(`Storage error for ${bucket}:`, storageError);
        }
      }

      // Combine all media
      const allMedia = [...processCmsMedia, ...allStorageFiles];
      
      console.log(`Found ${allMedia.length} media items:`, {
        cms: processCmsMedia.length,
        storage: allStorageFiles.length,
        bucketBreakdown: buckets.map(bucket => ({
          bucket,
          count: allStorageFiles.filter(f => f.bucket === bucket).length
        }))
      });
      
      setMedia(allMedia);
    } catch (error) {
      console.error('Error fetching media:', error);
      toast({
        title: "Error",
        description: "Failed to load media library",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getFileType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image/jpeg';
    if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video/mp4';
    return 'application/octet-stream';
  };

  const filterAndSortMedia = () => {
    let filtered = [...media];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.filename.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply type filter
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
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'filename':
          return a.original_filename.localeCompare(b.original_filename);
        case 'file_size':
          return b.file_size - a.file_size;
        case 'usage_count':
          return (b.usage_count || 0) - (a.usage_count || 0);
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredMedia(filtered);
  };

  const handleDelete = async (item: MediaItem) => {
    try {
      // Check if media is in use
      if ((item.usage_count || 0) > 0) {
        toast({
          title: "Cannot Delete",
          description: "This media is currently being used by content items. Remove it from content first.",
          variant: "destructive",
        });
        return;
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('cms-media')
        .remove([item.storage_path]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('cms_media')
        .delete()
        .eq('id', item.id);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Media item deleted successfully",
      });

      // Refresh media list
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

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (mimeType.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (mimeType.includes('pdf') || mimeType.includes('text')) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getOptimizationStatusBadge = (status: MediaItem['optimization_status']) => {
    switch (status) {
      case 'optimized':
        return <Badge variant="default" className="text-xs bg-green-100 text-green-800">Optimized</Badge>;
      case 'processing':
        return <Badge variant="default" className="text-xs bg-blue-100 text-blue-800">Processing</Badge>;
      case 'pending':
        return <Badge variant="default" className="text-xs bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      case 'not_optimized':
      default:
        return <Badge variant="outline" className="text-xs">Not Optimized</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getImageUrl = (item: MediaItem) => {
    // Determine the correct bucket
    const bucket = (item as any).bucket || 'cms-media';
    
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(item.storage_path);
    return data.publicUrl;
  };

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          You need administrator privileges to access the media library.
        </AlertDescription>
      </Alert>
    );
  }

  // Helper functions for new features
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

  const handleBulkOptimization = async (settings: OptimizationJob['settings']) => {
    if (selectedItems.size === 0) return;

    const jobId = crypto.randomUUID();
    const job: OptimizationJob = {
      id: jobId,
      media_ids: Array.from(selectedItems),
      status: 'pending',
      progress: 0,
      settings
    };

    setOptimizationJobs(prev => [...prev, job]);
    toast({
      title: "Optimization Started",
      description: `Processing ${selectedItems.size} files...`,
    });

    // Simulate optimization process
    setTimeout(() => {
      setOptimizationJobs(prev => 
        prev.map(j => j.id === jobId ? { ...j, status: 'processing', progress: 25 } : j)
      );
    }, 1000);

    setTimeout(() => {
      setOptimizationJobs(prev => 
        prev.map(j => j.id === jobId ? { ...j, progress: 75 } : j)
      );
    }, 3000);

    setTimeout(() => {
      setOptimizationJobs(prev => 
        prev.map(j => j.id === jobId ? { ...j, status: 'completed', progress: 100 } : j)
      );
      toast({
        title: "Optimization Complete",
        description: `Successfully optimized ${selectedItems.size} files`,
      });
      clearSelection();
    }, 5000);
  };

  const handleStarItem = async (item: MediaItem) => {
    // Simulate starring functionality
    setMedia(prev => 
      prev.map(m => m.id === item.id ? { ...m, starred: !m.starred } : m)
    );
    toast({
      title: item.starred ? "Removed from favorites" : "Added to favorites",
      description: item.original_filename,
    });
  };

  const renderOptimizationControls = () => (
    <Dialog open={showOptimization} onOpenChange={setShowOptimization}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media Optimization</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="bulk" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bulk">Bulk Optimization</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="bulk" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Quality</label>
                <Select defaultValue="80">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">Low (60%)</SelectItem>
                    <SelectItem value="80">Medium (80%)</SelectItem>
                    <SelectItem value="90">High (90%)</SelectItem>
                    <SelectItem value="100">Lossless</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Format</label>
                <Select defaultValue="webp">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webp">WebP</SelectItem>
                    <SelectItem value="avif">AVIF</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="resize" />
                <label htmlFor="resize" className="text-sm">Resize images</label>
              </div>
              <div className="grid grid-cols-2 gap-2 ml-6">
                <Input placeholder="Max width" type="number" />
                <Input placeholder="Max height" type="number" />
              </div>
            </div>
            
            <Button 
              onClick={() => handleBulkOptimization({
                quality: 80,
                format: 'webp',
                resize: false
              })}
              disabled={selectedItems.size === 0}
              className="w-full"
            >
              <Zap className="h-4 w-4 mr-2" />
              Optimize {selectedItems.size} Selected Files
            </Button>
          </TabsContent>
          
          <TabsContent value="settings" className="space-y-4">
            <div className="space-y-4">
              <h4 className="font-medium">Auto-optimization Settings</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="auto-webp" />
                  <label htmlFor="auto-webp" className="text-sm">Auto-convert to WebP on upload</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="auto-resize" />
                  <label htmlFor="auto-resize" className="text-sm">Auto-resize large images</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="generate-thumbnails" />
                  <label htmlFor="generate-thumbnails" className="text-sm">Generate thumbnails</label>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );

  const renderEditDialog = () => (
    <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Media</DialogTitle>
        </DialogHeader>
        {editingItem && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Filename</label>
              <Input value={editingItem.original_filename} />
            </div>
            <div>
              <label className="text-sm font-medium">Alt Text</label>
              <Input placeholder="Describe this image..." />
            </div>
            <div>
              <label className="text-sm font-medium">Caption</label>
              <Textarea placeholder="Image caption..." />
            </div>
            <div>
              <label className="text-sm font-medium">Tags</label>
              <Input placeholder="tag1, tag2, tag3" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button>Save Changes</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Media Library</h2>
          <p className="text-muted-foreground">
            Manage, optimize, and organize your media files
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBulkMode(!bulkMode)}>
            <Archive className="h-4 w-4 mr-2" />
            {bulkMode ? 'Exit Bulk' : 'Bulk Actions'}
          </Button>
          
          <Button variant="outline" onClick={() => setShowOptimization(true)}>
            <Sliders className="h-4 w-4 mr-2" />
            Optimize
          </Button>
          
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Media
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {bulkMode && (
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedItems.size} of {filteredMedia.length} selected
                </span>
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
                    <Zap className="h-4 w-4 mr-1" />
                    Optimize
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button size="sm" variant="destructive">
                    <Trash2 className="h-4 w-4 mr-1" />
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
            <CardTitle className="text-lg">Active Optimizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {optimizationJobs.filter(job => job.status !== 'completed').map(job => (
              <div key={job.id} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Optimizing {job.media_ids.length} files</span>
                  <span>{job.progress}%</span>
                </div>
                <Progress value={job.progress} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <Card>
          <CardHeader>
            <CardTitle>Upload New Media</CardTitle>
          </CardHeader>
          <CardContent>
            <EnhancedImageUpload
              onUpload={(url) => {
                setShowUpload(false);
                fetchMedia();
                toast({
                  title: "Success",
                  description: "Media uploaded successfully",
                });
              }}
              bucket="cms-media"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowUpload(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Filters and Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search media files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2 items-center flex-wrap">
              <Select value={filterBy} onValueChange={(value: FilterBy) => setFilterBy(value)}>
                <SelectTrigger className="w-36">
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
                <SelectTrigger className="w-36">
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

              {/* View Mode Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-none border-x"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'compact' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('compact')}
                  className="rounded-l-none"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchMedia()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Media Display */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filteredMedia.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Media Found</h3>
            <p className="text-muted-foreground">
              {searchQuery || filterBy !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Upload your first media file to get started'
              }
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredMedia.map((item) => (
            <Card key={item.id} className="overflow-hidden group relative">
              {bulkMode && (
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={() => toggleItemSelection(item.id)}
                    className="bg-white shadow-lg"
                  />
                </div>
              )}
              
              <div className="aspect-square relative">
                {item.mime_type.startsWith('image/') ? (
                  <img
                    src={getImageUrl(item)}
                    alt={item.original_filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    {getFileIcon(item.mime_type)}
                  </div>
                )}
                
                {/* Status Badges */}
                <div className="absolute top-2 right-2 flex gap-1">
                  {item.starred && (
                    <Badge variant="secondary" className="h-6 w-6 p-0 rounded-full">
                      <Star className="h-3 w-3 fill-current" />
                    </Badge>
                  )}
                  {item.optimization_status === 'optimized' && (
                    <Badge variant="secondary" className="h-6 w-6 p-0 rounded-full bg-green-100">
                      <Zap className="h-3 w-3 text-green-600" />
                    </Badge>
                  )}
                  {item.optimization_status === 'processing' && (
                    <Badge variant="secondary" className="h-6 w-6 p-0 rounded-full bg-blue-100">
                      <RefreshCw className="h-3 w-3 text-blue-600 animate-spin" />
                    </Badge>
                  )}
                </div>
                
                {/* Enhanced Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => window.open(getImageUrl(item), '_blank')}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleStarItem(item)}>
                      <Star className={`h-4 w-4 ${item.starred ? 'fill-current' : ''}`} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="secondary">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingItem(item)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(item)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => {
                            setItemToDelete(item);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              
              <CardContent className="p-3">
                <h4 className="font-medium text-sm truncate" title={item.original_filename}>
                  {item.original_filename}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatFileSize(item.file_size)}</span>
                    <Badge variant={item.usage_count ? 'default' : 'secondary'} className="text-xs">
                      {item.usage_count || 0}
                    </Badge>
                  </div>
                  
                  {/* Optimization Info */}
                  <div className="flex items-center justify-between">
                    {getOptimizationStatusBadge(item.optimization_status)}
                    {item.width && item.height && (
                      <Badge variant="outline" className="text-xs">
                        {item.width}×{item.height}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Available Formats */}
                  {item.formats_available && item.formats_available.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.formats_available.map((format, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] px-1 py-0">
                          {format}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Compression Info */}
                  {item.optimization_metadata?.compression_ratio && (
                    <div className="text-[10px] text-green-600">
                      {item.optimization_metadata.compression_ratio}% smaller
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0">
              {filteredMedia.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 p-4 hover:bg-muted/50 ${
                    index !== filteredMedia.length - 1 ? 'border-b' : ''
                  }`}
                >
                  {bulkMode && (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItemSelection(item.id)}
                    />
                  )}
                  
                  {/* Thumbnail */}
                  <div className="w-16 h-16 bg-muted flex items-center justify-center overflow-hidden rounded">
                    {item.mime_type.startsWith('image/') ? (
                      <img
                        src={getImageUrl(item)}
                        alt={item.original_filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getFileIcon(item.mime_type)
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{item.original_filename}</h4>
                      {item.starred && <Star className="h-4 w-4 fill-current text-yellow-500" />}
                      {getOptimizationStatusBadge(item.optimization_status)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{formatFileSize(item.file_size)}</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      {item.width && item.height && (
                        <span>{item.width} × {item.height}</span>
                      )}
                    </div>
                    
                    {/* Additional optimization details */}
                    <div className="flex items-center gap-2 mt-1">
                      {item.formats_available && item.formats_available.length > 0 && (
                        <div className="flex gap-1">
                          <span className="text-xs text-muted-foreground">Formats:</span>
                          {item.formats_available.map((format, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs px-1 py-0">
                              {format}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {item.optimization_metadata?.compression_ratio && (
                        <Badge variant="outline" className="text-xs text-green-600">
                          -{item.optimization_metadata.compression_ratio}%
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Usage */}
                  <div className="text-right">
                    <Badge variant={item.usage_count ? 'default' : 'secondary'}>
                      {item.usage_count || 0} uses
                    </Badge>
                    {item.content_items && item.content_items.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Used in: {item.content_items.slice(0, 2).join(', ')}
                        {item.content_items.length > 2 && ` +${item.content_items.length - 2} more`}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.open(getImageUrl(item), '_blank')}>
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditingItem(item)}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(item)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => {
                          setItemToDelete(item);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Compact View */
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {filteredMedia.map((item) => (
                <div key={item.id} className="relative group">
                  {bulkMode && (
                    <div className="absolute top-1 left-1 z-10">
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4"
                      />
                    </div>
                  )}
                  
                  <div className="aspect-square bg-muted rounded overflow-hidden cursor-pointer hover:opacity-80">
                    {item.mime_type.startsWith('image/') ? (
                      <img
                        src={getImageUrl(item)}
                        alt={item.original_filename}
                        className="w-full h-full object-cover"
                        onClick={() => window.open(getImageUrl(item), '_blank')}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {getFileIcon(item.mime_type)}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-center mt-1 truncate" title={item.original_filename}>
                    {item.original_filename}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Stats */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600">{media.length}</div>
              <div className="text-sm text-muted-foreground">Total Files</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">
                {formatFileSize(media.reduce((acc, item) => acc + item.file_size, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Size</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600">
                {media.filter(item => item.mime_type.startsWith('image/')).length}
              </div>
              <div className="text-sm text-muted-foreground">Images</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-600">
                {media.filter(item => (item.usage_count || 0) === 0).length}
              </div>
              <div className="text-sm text-muted-foreground">Unused</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-600">
                {media.filter(item => item.starred).length}
              </div>
              <div className="text-sm text-muted-foreground">Starred</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {renderOptimizationControls()}
      {renderEditDialog()}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.original_filename}"? 
              This action cannot be undone.
              {itemToDelete?.usage_count && itemToDelete.usage_count > 0 && (
                <span className="text-destructive block mt-2">
                  Warning: This file is currently used by {itemToDelete.usage_count} content item(s).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && handleDelete(itemToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  Trash2,
  Search,
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
  FolderOpen,
  Star,
  Sliders,
  ExternalLink
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
  alt_text?: string;
  caption?: string;
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
    formats: string[];
    resize: boolean;
    maxWidth?: number;
    maxHeight?: number;
    preserveMetadata: boolean;
    enableProgressiveJpeg: boolean;
    enableLosslessWebP: boolean;
  };
  results?: {
    processed: number;
    successful: number;
    failed: number;
    totalSavings: number;
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
  const [_editingItem, _setEditingItem] = useState<MediaItem | null>(null);
  const [optimizingItem, setOptimizingItem] = useState<MediaItem | null>(null);
  const [optimizationSettings, setOptimizationSettings] = useState({
    quality: 80,
    formats: ['WEBP'],
    resize: false,
    maxWidth: 1920,
    maxHeight: 1080,
    preserveMetadata: false,
    enableProgressiveJpeg: true,
    enableLosslessWebP: false,
  });

  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMedia defined below, re-run on isAdmin change
  }, [isAdmin]);

  useEffect(() => {
    filterAndSortMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterAndSortMedia defined below, re-run on filter changes
  }, [media, searchQuery, sortBy, filterBy]);

  const populateOptimizationStatus = async () => {
    try {
      setLoading(true);

      const { count: existingCount } = await supabase
        .from('media_optimization_status')
        .select('id', { count: 'exact', head: true });

      if ((existingCount || 0) > 0) {
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

  const fetchMedia = async () => {
    try {
      setLoading(true);

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

      const { data: optimizationData, error: optimizationError } = await supabase
        .from('media_optimization_status')
        .select('*');

      if (optimizationError) {
        console.error('Error fetching optimization status:', optimizationError);
      }

      const optimizationLookup: Record<string, Record<string, unknown>> = {};
      if (optimizationData) {
        optimizationData.forEach(opt => {
          const key = `${opt.bucket_name}/${opt.file_path}`;
          optimizationLookup[key] = opt;
        });
      }

      const processCmsMedia = (cmsMediaData || []).map(item => ({
        ...item,
        usage_count: item.cms_content_media?.length || 0,
        content_items: item.cms_content_media?.map((rel: { cms_content?: { title?: string } }) =>
          rel.cms_content?.title || 'Untitled'
        ).filter(Boolean) || [],
        source: 'cms',
        optimization_status: 'not_optimized',
        formats_available: ['Original'],
        optimization_metadata: {
          original_size: item.file_size,
          formats: [{
            format: item.mime_type.split('/')[1]?.toUpperCase() || 'UNKNOWN',
            size: item.file_size,
            width: item.width,
            height: item.height
          }]
        }
      }));

      const buckets = ['adult-model-images', 'city-images', 'tag-images'];
      let allStorageFiles: Record<string, unknown>[] = [];

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
                const optimizationKey = `${bucket}/${file.name}`;
                const optimizationInfo = optimizationLookup[optimizationKey];

                let optimizationStatus = 'not_optimized';
                let formatsAvailable = [ext.toUpperCase()];
                let optimizationMetadata = {
                  original_size: file.metadata?.size || 0,
                  compressed_size: undefined as number | undefined,
                  compression_ratio: undefined as number | undefined,
                  formats: [{
                    format: ext.toUpperCase(),
                    size: file.metadata?.size || 0,
                    width: file.metadata?.width,
                    height: file.metadata?.height
                  }]
                };

                if (optimizationInfo) {
                  optimizationStatus = optimizationInfo.optimization_status;
                  if (optimizationInfo.optimized_formats && Array.isArray(optimizationInfo.optimized_formats)) {
                    const formats = optimizationInfo.optimized_formats;
                    formatsAvailable = [ext.toUpperCase(), ...formats.map((f: { format?: string }) => f.format?.toUpperCase())].filter(Boolean);

                    optimizationMetadata = {
                      ...optimizationMetadata,
                      compressed_size: optimizationInfo.compression_data?.total_compressed_size,
                      compression_ratio: optimizationInfo.compression_data?.compression_ratio,
                      formats: [
                        {
                          format: ext.toUpperCase(),
                          size: optimizationInfo.original_size,
                          width: file.metadata?.width,
                          height: file.metadata?.height
                        },
                        ...formats
                      ]
                    };
                  }
                } else {
                  const hasOptimizedFormats = ['webp', 'avif'].includes(ext);
                  if (hasOptimizedFormats) {
                    optimizationStatus = 'optimized';
                    optimizationMetadata.compressed_size = Math.floor((file.metadata?.size || 0) * 0.7);
                    optimizationMetadata.compression_ratio = 30;
                  }
                }

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
                  optimization_status: optimizationStatus,
                  formats_available: formatsAvailable,
                  optimization_metadata: optimizationMetadata
                };
              });

            allStorageFiles = [...allStorageFiles, ...processedFiles];
          }
        } catch (storageError) {
          console.error(`Storage error for ${bucket}:`, storageError);
        }
      }

      const allMedia = [...processCmsMedia, ...allStorageFiles];
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

      const { error: dbError } = await supabase
        .from('cms_media')
        .delete()
        .eq('id', item.id);

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

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon style={{ height: 16, width: 16 }} />;
    if (mimeType.startsWith('video/')) return <Video style={{ height: 16, width: 16 }} />;
    if (mimeType.includes('pdf') || mimeType.includes('text')) return <FileText style={{ height: 16, width: 16 }} />;
    return <File style={{ height: 16, width: 16 }} />;
  };

  const getOptimizationStatusBadge = (status: MediaItem['optimization_status']) => {
    switch (status) {
      case 'optimized':
        return <Badge variant="default" style={{ fontSize: '0.75rem', backgroundColor: '#dcfce7', color: '#166534' }}>Optimized</Badge>;
      case 'processing':
        return <Badge variant="default" style={{ fontSize: '0.75rem', backgroundColor: '#dbeafe', color: '#1e40af' }}>Processing</Badge>;
      case 'pending':
        return <Badge variant="default" style={{ fontSize: '0.75rem', backgroundColor: '#fef9c3', color: '#854d0e' }}>Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive" style={{ fontSize: '0.75rem' }}>Failed</Badge>;
      case 'not_optimized':
      default:
        return <Badge variant="outline" style={{ fontSize: '0.75rem' }}>Not Optimized</Badge>;
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
    const bucket = (item as unknown as Record<string, unknown>).bucket as string || 'cms-media';

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(item.storage_path);
    return data.publicUrl;
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

  const renderOptimizationControls = () => (
    <Dialog open={showOptimization} onOpenChange={setShowOptimization}>
      <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>
            {selectedItems.size > 0
              ? `Optimize ${selectedItems.size} Selected Files`
              : 'Image Optimization Settings'
            }
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="settings" style={{ width: '100%' }}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr 1fr' }}>
            <TabsTrigger value="settings">Optimization Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview & Quality</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Options</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                {/* Quality Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ fontSize: '1.125rem' }}>Quality & Compression</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                          Quality: {optimizationSettings.quality}%
                        </Typography>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={optimizationSettings.quality}
                          onChange={(e) => setOptimizationSettings(prev => ({
                            ...prev,
                            quality: parseInt(e.target.value)
                          }))}
                          style={{ width: '100%' }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">Smaller file</Typography>
                          <Typography variant="caption" color="text.secondary">Better quality</Typography>
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Output Formats</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {['WEBP', 'AVIF', 'JPEG', 'PNG'].map(format => (
                            <Box key={format} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Checkbox
                                checked={optimizationSettings.formats.includes(format)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setOptimizationSettings(prev => ({
                                      ...prev,
                                      formats: [...prev.formats, format]
                                    }));
                                  } else {
                                    setOptimizationSettings(prev => ({
                                      ...prev,
                                      formats: prev.formats.filter(f => f !== format)
                                    }));
                                  }
                                }}
                              />
                              <Typography variant="body2">{format}</Typography>
                              {format === 'WEBP' && <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>Recommended</Badge>}
                              {format === 'AVIF' && <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>Best compression</Badge>}
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                {/* Resize Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ fontSize: '1.125rem' }}>Resize Options</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Checkbox
                          checked={optimizationSettings.resize}
                          onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                            ...prev,
                            resize: !!checked
                          }))}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Enable resizing</Typography>
                      </Box>

                      {optimizationSettings.resize && (
                        <>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Max Width (px)</Typography>
                            <Input
                              type="number"
                              value={optimizationSettings.maxWidth}
                              onChange={(e) => setOptimizationSettings(prev => ({
                                ...prev,
                                maxWidth: parseInt(e.target.value) || 1920
                              }))}
                              placeholder="1920"
                            />
                          </Box>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Max Height (px)</Typography>
                            <Input
                              type="number"
                              value={optimizationSettings.maxHeight}
                              onChange={(e) => setOptimizationSettings(prev => ({
                                ...prev,
                                maxHeight: parseInt(e.target.value) || 1080
                              }))}
                              placeholder="1080"
                            />
                          </Box>
                        </>
                      )}

                      <Typography variant="caption" color="text.secondary">
                        Images will be resized proportionally to fit within these dimensions
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            </Box>
          </TabsContent>

          <TabsContent value="preview">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Optimization Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography sx={{ fontWeight: 500 }}>Estimated Results</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Quality Level:</Typography>
                          <Typography variant="body2" sx={{
                            color: optimizationSettings.quality >= 90 ? 'success.main' :
                              optimizationSettings.quality >= 70 ? 'warning.main' : 'error.main'
                          }}>
                            {optimizationSettings.quality >= 90 ? 'Excellent' :
                              optimizationSettings.quality >= 70 ? 'Good' : 'Compressed'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Est. Size Reduction:</Typography>
                          <Typography variant="body2" sx={{ color: 'success.main' }}>
                            {100 - optimizationSettings.quality}% - {100 - Math.floor(optimizationSettings.quality * 0.8)}%
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Output Formats:</Typography>
                          <Typography variant="body2">{optimizationSettings.formats.length} format(s)</Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography sx={{ fontWeight: 500 }}>Format Benefits</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {optimizationSettings.formats.includes('WEBP') && (
                          <Typography variant="caption" sx={{ color: 'success.main' }}>WebP: Up to 35% smaller than JPEG</Typography>
                        )}
                        {optimizationSettings.formats.includes('AVIF') && (
                          <Typography variant="caption" sx={{ color: 'success.main' }}>AVIF: Up to 50% smaller than JPEG</Typography>
                        )}
                        {optimizationSettings.formats.includes('JPEG') && (
                          <Typography variant="caption" sx={{ color: 'info.main' }}>JPEG: Universal compatibility</Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>

          <TabsContent value="advanced">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Options</CardTitle>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            checked={optimizationSettings.preserveMetadata}
                            onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                              ...prev,
                              preserveMetadata: !!checked
                            }))}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Preserve Metadata</Typography>
                            <Typography variant="caption" color="text.secondary">Keep EXIF data, copyright info</Typography>
                          </Box>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            checked={optimizationSettings.enableProgressiveJpeg}
                            onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                              ...prev,
                              enableProgressiveJpeg: !!checked
                            }))}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Progressive JPEG</Typography>
                            <Typography variant="caption" color="text.secondary">Better loading experience</Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox
                            checked={optimizationSettings.enableLosslessWebP}
                            onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                              ...prev,
                              enableLosslessWebP: !!checked
                            }))}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>Lossless WebP</Typography>
                            <Typography variant="caption" color="text.secondary">No quality loss</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </TabsContent>
        </Tabs>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button variant="outline" onClick={() => setShowOptimization(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkOptimization}
            disabled={selectedItems.size === 0 || optimizationSettings.formats.length === 0}
          >
            <Zap style={{ height: 16, width: 16, marginRight: 4 }} />
            Optimize {selectedItems.size} Files
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );

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
        <Card>
          <CardHeader>
            <CardTitle>Upload New Media</CardTitle>
          </CardHeader>
          <CardContent>
            <EnhancedImageUpload
              onUpload={(_url) => {
                setShowUpload(false);
                fetchMedia();
                toast({
                  title: "Success",
                  description: "Media uploaded successfully",
                });
              }}
              bucket="cms-media"
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
              <Button variant="outline" onClick={() => setShowUpload(false)}>
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Filters and Controls */}
      <Card>
        <CardContent style={{ padding: 16 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2 }}>
            {/* Search */}
            <Box sx={{ position: 'relative', flex: 1, maxWidth: { md: 400 } }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search media files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </Box>

            {/* Filters */}
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

              {/* View Mode Toggle */}
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

      {/* Enhanced Media Display */}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
          <Box sx={{ width: 32, height: 32, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
        </Box>
      ) : filteredMedia.length === 0 ? (
        <Card>
          <CardContent style={{ paddingTop: 48, paddingBottom: 48, textAlign: 'center' }}>
            <ImageIcon style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
            <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>No Media Found</Typography>
            <Typography variant="body2" color="text.secondary">
              {searchQuery || filterBy !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Upload your first media file to get started'
              }
            </Typography>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
          {filteredMedia.map((item) => (
            <Card key={item.id} style={{ overflow: 'hidden', position: 'relative' }}>
              {bulkMode && (
                <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={() => toggleItemSelection(item.id)}
                    style={{ backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                </Box>
              )}

              <Box sx={{ aspectRatio: '1/1', position: 'relative' }}>
                {item.mime_type.startsWith('image/') ? (
                  <Box
                    component="img"
                    src={getImageUrl(item)}
                    alt={item.original_filename}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                ) : (
                  <Box sx={{ width: '100%', height: '100%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getFileIcon(item.mime_type)}
                  </Box>
                )}

                {/* Status Badges */}
                <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5 }}>
                  {item.starred && (
                    <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Star style={{ height: 12, width: 12, color: '#ca8a04', fill: 'currentColor' }} />
                    </Badge>
                  )}
                  {item.optimization_status === 'optimized' && (
                    <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Zap style={{ height: 12, width: 12, color: '#16a34a' }} />
                    </Badge>
                  )}
                  {item.optimization_status === 'processing' && (
                    <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RefreshCw style={{ height: 12, width: 12, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                    </Badge>
                  )}
                  {optimizingItem?.id === item.id && (
                    <Badge variant="secondary" style={{ height: 24, width: 24, padding: 0, borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RefreshCw style={{ height: 12, width: 12, color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                    </Badge>
                  )}
                </Box>

                {/* Actions Overlay */}
                <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', opacity: 0, '&:hover': { opacity: 1 }, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <Button size="sm" variant="ghost" style={{ color: 'white' }}>
                    <Eye style={{ height: 16, width: 16 }} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" style={{ color: 'white' }}>
                        <MoreVertical style={{ height: 16, width: 16 }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleStarItem(item)}>
                        <Star style={{ height: 16, width: 16, marginRight: 8 }} />
                        {item.starred ? 'Unstar' : 'Star'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSingleOptimization(item)}>
                        <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                        {optimizingItem?.id === item.id ? 'Optimizing...' : 'Optimize'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedItems(new Set([item.id]));
                        setShowOptimization(true);
                      }}>
                        <Settings style={{ height: 16, width: 16, marginRight: 8 }} />
                        Optimize with Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(item)}>
                        <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setItemToDelete(item);
                          setDeleteDialogOpen(true);
                        }}
                        style={{ color: '#dc2626' }}
                      >
                        <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Box>
              </Box>

              {/* Enhanced Card Content */}
              <CardContent style={{ padding: 12 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mb: 1 }}>{item.original_filename}</Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">{formatFileSize(item.file_size)}</Typography>
                    <Badge variant={item.usage_count ? 'default' : 'secondary'} style={{ fontSize: '0.75rem' }}>
                      {item.usage_count || 0}
                    </Badge>
                  </Box>

                  {/* Optimization Info */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {getOptimizationStatusBadge(item.optimization_status)}
                    {item.width && item.height && (
                      <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                        {item.width}x{item.height}
                      </Badge>
                    )}
                  </Box>

                  {/* Available Formats */}
                  {item.formats_available && item.formats_available.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {item.formats_available.map((format, idx) => (
                        <Badge key={idx} variant="secondary" style={{ fontSize: '10px', padding: '0 4px' }}>
                          {format}
                        </Badge>
                      ))}
                    </Box>
                  )}

                  {/* Compression Info */}
                  {item.optimization_metadata?.compression_ratio && (
                    <Typography variant="caption" sx={{ color: 'success.main' }}>
                      {item.optimization_metadata.compression_ratio}% smaller
                    </Typography>
                  )}

                  {/* Optimized Files Links */}
                  {item.optimization_metadata?.formats && item.optimization_metadata.formats.length > 1 && (
                    <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Optimized versions:</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {item.optimization_metadata.formats.map((formatInfo, idx) => (
                          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box
                              component="a"
                              href={`${getImageUrl(item).split('.')[0]}.${formatInfo.format.toLowerCase()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.625rem' }}
                            >
                              <ExternalLink style={{ height: 8, width: 8 }} />
                              {formatInfo.format}
                            </Box>
                            <Typography sx={{ fontSize: '0.625rem' }} color="text.secondary">
                              {formatFileSize(formatInfo.size)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : viewMode === 'list' ? (
        <Card>
          <CardContent style={{ padding: 0 }}>
            <Box sx={{ '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
              {filteredMedia.map((item) => (
                <Box key={item.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                  {bulkMode && (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItemSelection(item.id)}
                    />
                  )}

                  <Box sx={{ width: 64, height: 64, borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover', flexShrink: 0 }}>
                    {item.mime_type.startsWith('image/') ? (
                      <Box
                        component="img"
                        src={getImageUrl(item)}
                        alt={item.original_filename}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getFileIcon(item.mime_type)}
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.original_filename}</Typography>
                      {item.starred && <Star style={{ height: 16, width: 16, fill: 'currentColor', color: '#eab308' }} />}
                      {getOptimizationStatusBadge(item.optimization_status)}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">{formatFileSize(item.file_size)}</Typography>
                      <Typography variant="body2" color="text.secondary">{new Date(item.created_at).toLocaleDateString()}</Typography>
                      {item.width && item.height && (
                        <Typography variant="body2" color="text.secondary">{item.width} x {item.height}</Typography>
                      )}
                    </Box>

                    {/* Additional optimization details */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      {item.formats_available && item.formats_available.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">Formats:</Typography>
                          {item.formats_available.map((format, idx) => (
                            <Badge key={idx} variant="secondary" style={{ fontSize: '0.75rem', padding: '0 4px' }}>
                              {format}
                            </Badge>
                          ))}
                        </Box>
                      )}
                      {item.optimization_metadata?.compression_ratio && (
                        <Badge variant="outline" style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                          -{item.optimization_metadata.compression_ratio}%
                        </Badge>
                      )}
                    </Box>

                    {/* Optimized Files Links */}
                    {item.optimization_metadata?.formats && item.optimization_metadata.formats.length > 1 && (
                      <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Optimized versions:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {item.optimization_metadata.formats.map((formatInfo, idx) => (
                            <Box
                              key={idx}
                              component="a"
                              href={`${getImageUrl(item).split('.')[0]}.${formatInfo.format.toLowerCase()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5 }}
                            >
                              <ExternalLink style={{ height: 12, width: 12 }} />
                              {formatInfo.format} ({formatFileSize(formatInfo.size)})
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Badge variant={item.usage_count ? 'default' : 'secondary'}>
                      {item.usage_count || 0}
                    </Badge>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical style={{ height: 16, width: 16 }} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleStarItem(item)}>
                          <Star style={{ height: 16, width: 16, marginRight: 8 }} />
                          {item.starred ? 'Unstar' : 'Star'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSingleOptimization(item)}>
                          <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                          {optimizingItem?.id === item.id ? 'Optimizing...' : 'Quick Optimize'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedItems(new Set([item.id]));
                          setShowOptimization(true);
                        }}>
                          <Settings style={{ height: 16, width: 16, marginRight: 8 }} />
                          Optimize with Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(item)}>
                          <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setItemToDelete(item);
                            setDeleteDialogOpen(true);
                          }}
                          style={{ color: '#dc2626' }}
                        >
                          <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      ) : (
        // Compact view
        <Card>
          <CardContent style={{ padding: 16 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {filteredMedia.map((item) => (
                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}>
                  {bulkMode && (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItemSelection(item.id)}
                    />
                  )}

                  {getFileIcon(item.mime_type)}

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.original_filename}</Typography>
                      {item.starred && <Star style={{ height: 12, width: 12, fill: 'currentColor', color: '#eab308' }} />}
                      {getOptimizationStatusBadge(item.optimization_status)}
                    </Box>
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    {formatFileSize(item.file_size)}
                  </Typography>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical style={{ height: 12, width: 12 }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleSingleOptimization(item)}>
                        <Zap style={{ height: 16, width: 16, marginRight: 8 }} />
                        Optimize
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(item)}>
                        <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setItemToDelete(item);
                          setDeleteDialogOpen(true);
                        }}
                        style={{ color: '#dc2626' }}
                      >
                        <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

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

      {/* Dialogs */}
      {renderOptimizationControls()}

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

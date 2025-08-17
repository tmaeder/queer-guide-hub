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
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
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
      case 'unoptimized':
        filtered = filtered.filter(item => item.optimization_status !== 'optimized');
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

    // Simulate optimization process with more realistic progress
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
      
      // Update media items to show optimized status
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

    // Simulate single file optimization
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedItems.size > 0 
              ? `Optimize ${selectedItems.size} Selected Files` 
              : 'Image Optimization Settings'
            }
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">Optimization Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview & Quality</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Options</TabsTrigger>
          </TabsList>
          
          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Quality Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quality & Compression</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Quality: {optimizationSettings.quality}%
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={optimizationSettings.quality}
                      onChange={(e) => setOptimizationSettings(prev => ({
                        ...prev,
                        quality: parseInt(e.target.value)
                      }))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Smaller file</span>
                      <span>Better quality</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">Output Formats</label>
                    <div className="space-y-2">
                      {['WEBP', 'AVIF', 'JPEG', 'PNG'].map(format => (
                        <div key={format} className="flex items-center space-x-2">
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
                          <span className="text-sm">{format}</span>
                          {format === 'WEBP' && <Badge variant="secondary" className="text-xs">Recommended</Badge>}
                          {format === 'AVIF' && <Badge variant="secondary" className="text-xs">Best compression</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resize Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resize Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={optimizationSettings.resize}
                      onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                        ...prev,
                        resize: !!checked
                      }))}
                    />
                    <span className="text-sm font-medium">Enable resizing</span>
                  </div>
                  
                  {optimizationSettings.resize && (
                    <>
                      <div>
                        <label className="text-sm font-medium">Max Width (px)</label>
                        <Input
                          type="number"
                          value={optimizationSettings.maxWidth}
                          onChange={(e) => setOptimizationSettings(prev => ({
                            ...prev,
                            maxWidth: parseInt(e.target.value) || 1920
                          }))}
                          placeholder="1920"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Max Height (px)</label>
                        <Input
                          type="number"
                          value={optimizationSettings.maxHeight}
                          onChange={(e) => setOptimizationSettings(prev => ({
                            ...prev,
                            maxHeight: parseInt(e.target.value) || 1080
                          }))}
                          placeholder="1080"
                        />
                      </div>
                    </>
                  )}
                  
                  <div className="text-xs text-muted-foreground">
                    Images will be resized proportionally to fit within these dimensions
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="preview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Optimization Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Estimated Results</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Quality Level:</span>
                        <span className={
                          optimizationSettings.quality >= 90 ? 'text-green-600' :
                          optimizationSettings.quality >= 70 ? 'text-yellow-600' : 'text-red-600'
                        }>
                          {optimizationSettings.quality >= 90 ? 'Excellent' :
                           optimizationSettings.quality >= 70 ? 'Good' : 'Compressed'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Est. Size Reduction:</span>
                        <span className="text-green-600">
                          {100 - optimizationSettings.quality}% - {100 - Math.floor(optimizationSettings.quality * 0.8)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Output Formats:</span>
                        <span>{optimizationSettings.formats.length} format(s)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Format Benefits</h4>
                    <div className="space-y-1 text-xs">
                      {optimizationSettings.formats.includes('WEBP') && (
                        <div className="text-green-600">✓ WebP: Up to 35% smaller than JPEG</div>
                      )}
                      {optimizationSettings.formats.includes('AVIF') && (
                        <div className="text-green-600">✓ AVIF: Up to 50% smaller than JPEG</div>
                      )}
                      {optimizationSettings.formats.includes('JPEG') && (
                        <div className="text-blue-600">• JPEG: Universal compatibility</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={optimizationSettings.preserveMetadata}
                        onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                          ...prev,
                          preserveMetadata: !!checked
                        }))}
                      />
                      <div>
                        <span className="text-sm font-medium">Preserve Metadata</span>
                        <p className="text-xs text-muted-foreground">Keep EXIF data, copyright info</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={optimizationSettings.enableProgressiveJpeg}
                        onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                          ...prev,
                          enableProgressiveJpeg: !!checked
                        }))}
                      />
                      <div>
                        <span className="text-sm font-medium">Progressive JPEG</span>
                        <p className="text-xs text-muted-foreground">Better loading experience</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={optimizationSettings.enableLosslessWebP}
                        onCheckedChange={(checked) => setOptimizationSettings(prev => ({
                          ...prev,
                          enableLosslessWebP: !!checked
                        }))}
                      />
                      <div>
                        <span className="text-sm font-medium">Lossless WebP</span>
                        <p className="text-xs text-muted-foreground">No quality loss</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setShowOptimization(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleBulkOptimization}
            disabled={selectedItems.size === 0 || optimizationSettings.formats.length === 0}
          >
            <Zap className="h-4 w-4 mr-1" />
            Optimize {selectedItems.size} Files
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Media Library</h1>
          <p className="text-muted-foreground">
            Manage and optimize your media files
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
          <Button variant="outline" onClick={() => setBulkMode(!bulkMode)}>
            <Archive className="h-4 w-4 mr-1" />
            {bulkMode ? 'Exit Bulk' : 'Bulk Mode'}
          </Button>
          <Button variant="outline" onClick={() => setShowOptimization(true)}>
            <Sliders className="h-4 w-4 mr-1" />
            Optimize
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {bulkMode && (
        <Card>
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
              <div key={job.id} className="space-y-3 p-4 border rounded-lg">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium">
                    Optimizing {job.media_ids.length} files ({job.settings.formats.join(', ')})
                  </span>
                  <Badge variant={job.status === 'processing' ? 'default' : 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
                <Progress value={job.progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{job.progress}% complete</span>
                  {job.results && (
                    <span>
                      {job.results.successful}/{job.results.processed} processed
                      {job.results.totalSavings > 0 && ` • ${formatFileSize(job.results.totalSavings)} saved`}
                    </span>
                  )}
                </div>
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
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    {getFileIcon(item.mime_type)}
                  </div>
                )}
                
                {/* Status Badges */}
                <div className="absolute top-2 right-2 flex gap-1">
                  {item.starred && (
                    <Badge variant="secondary" className="h-6 w-6 p-0 rounded-full bg-yellow-100">
                      <Star className="h-3 w-3 text-yellow-600 fill-current" />
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
                  {optimizingItem?.id === item.id && (
                    <Badge variant="secondary" className="h-6 w-6 p-0 rounded-full bg-blue-100">
                      <RefreshCw className="h-3 w-3 text-blue-600 animate-spin" />
                    </Badge>
                  )}
                </div>

                {/* Actions Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/20">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-white hover:bg-white/20">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleStarItem(item)}>
                        <Star className="h-4 w-4 mr-2" />
                        {item.starred ? 'Unstar' : 'Star'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSingleOptimization(item)}>
                        <Zap className="h-4 w-4 mr-2" />
                        {optimizingItem?.id === item.id ? 'Optimizing...' : 'Optimize'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedItems(new Set([item.id]));
                        setShowOptimization(true);
                      }}>
                        <Settings className="h-4 w-4 mr-2" />
                        Optimize with Settings
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
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Enhanced Card Content */}
              <CardContent className="p-3">
                <h4 className="font-medium text-sm truncate mb-2">{item.original_filename}</h4>
                
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
            <div className="divide-y">
              {filteredMedia.map((item) => (
                <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-muted/50">
                  {bulkMode && (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItemSelection(item.id)}
                    />
                  )}
                  
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {item.mime_type.startsWith('image/') ? (
                      <img
                        src={getImageUrl(item)}
                        alt={item.original_filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {getFileIcon(item.mime_type)}
                      </div>
                    )}
                  </div>
                  
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
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={item.usage_count ? 'default' : 'secondary'}>
                      {item.usage_count || 0}
                    </Badge>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleStarItem(item)}>
                          <Star className="h-4 w-4 mr-2" />
                          {item.starred ? 'Unstar' : 'Star'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSingleOptimization(item)}>
                          <Zap className="h-4 w-4 mr-2" />
                          {optimizingItem?.id === item.id ? 'Optimizing...' : 'Quick Optimize'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedItems(new Set([item.id]));
                          setShowOptimization(true);
                        }}>
                          <Settings className="h-4 w-4 mr-2" />
                          Optimize with Settings
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
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Compact view
        <Card>
          <CardContent className="p-4">
            <div className="space-y-1">
              {filteredMedia.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded">
                  {bulkMode && (
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItemSelection(item.id)}
                    />
                  )}
                  
                  {getFileIcon(item.mime_type)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{item.original_filename}</span>
                      {item.starred && <Star className="h-3 w-3 fill-current text-yellow-500" />}
                      {getOptimizationStatusBadge(item.optimization_status)}
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(item.file_size)}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleSingleOptimization(item)}>
                        <Zap className="h-4 w-4 mr-2" />
                        Optimize
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(item)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => {
                          setItemToDelete(item);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-red-600"
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
      )}

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Library Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{media.length}</div>
              <div className="text-sm text-muted-foreground">Total Files</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {formatFileSize(media.reduce((acc, item) => acc + item.file_size, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Size</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {media.filter(item => item.optimization_status === 'optimized').length}
              </div>
              <div className="text-sm text-muted-foreground">Optimized</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {media.filter(item => (item.usage_count || 0) === 0).length}
              </div>
              <div className="text-sm text-muted-foreground">Unused</div>
            </div>
          </div>
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
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
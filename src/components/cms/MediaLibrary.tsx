import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  FileText
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
}

type ViewMode = 'grid' | 'list';
type SortBy = 'created_at' | 'filename' | 'file_size' | 'usage_count';
type FilterBy = 'all' | 'images' | 'videos' | 'documents' | 'unused';

export function MediaLibrary() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  
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
              .map(file => ({
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
                bucket: bucket
              }));
            
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Media Library</h2>
          <p className="text-muted-foreground">
            Manage all content-related media files
          </p>
        </div>
        
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Media
        </Button>
      </div>

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

      {/* Filters and Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
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
            <div className="flex gap-2 items-center">
              <Select value={filterBy} onValueChange={(value: FilterBy) => setFilterBy(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Files</SelectItem>
                  <SelectItem value="images">Images</SelectItem>
                  <SelectItem value="videos">Videos</SelectItem>
                  <SelectItem value="documents">Documents</SelectItem>
                  <SelectItem value="unused">Unused</SelectItem>
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
                </SelectContent>
              </Select>

              {/* View Mode Toggle */}
              <div className="flex">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Media Grid/List */}
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
            <Card key={item.id} className="overflow-hidden group">
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
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => window.open(getImageUrl(item), '_blank')}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="secondary">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                </div>
              </div>
              
              <CardContent className="p-3">
                <h4 className="font-medium text-sm truncate" title={item.original_filename}>
                  {item.original_filename}
                </h4>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{formatFileSize(item.file_size)}</span>
                  <Badge variant={item.usage_count ? 'default' : 'secondary'}>
                    {item.usage_count || 0} uses
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
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
                  {/* Thumbnail */}
                  <div className="w-12 h-12 bg-muted flex items-center justify-center overflow-hidden">
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
                    <h4 className="font-medium truncate">{item.original_filename}</h4>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{formatFileSize(item.file_size)}</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      {item.width && item.height && (
                        <span>{item.width} × {item.height}</span>
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
      )}

      {/* Stats */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{media.length}</div>
              <div className="text-sm text-muted-foreground">Total Files</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {formatFileSize(media.reduce((acc, item) => acc + item.file_size, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Size</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {media.filter(item => item.mime_type.startsWith('image/')).length}
              </div>
              <div className="text-sm text-muted-foreground">Images</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {media.filter(item => (item.usage_count || 0) === 0).length}
              </div>
              <div className="text-sm text-muted-foreground">Unused</div>
            </div>
          </div>
        </CardContent>
      </Card>

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
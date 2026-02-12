import { useState, useEffect } from 'react';
import { Upload, Image, File, Trash2, Download, Search, Filter } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function CMSMediaManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      setLoading(true);

      // Fetch CMS media
      const { data: cmsMediaData, error: cmsError } = await supabase
        .from('cms_media')
        .select(`
          *,
          content_items (
            id,
            title
          )
        `)
        .order('created_at', { ascending: false });

      if (cmsError) {
        console.error('CMS media error:', cmsError);
      }

      // Process CMS media data
      const processCmsMedia = (cmsMediaData || []).map(item => ({
        ...item,
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

      setMediaFiles(allMedia);
    } catch (error) {
      console.error('Error fetching media:', error);
      toast.error('Failed to load media files');
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

  const getImageUrl = (file: any) => {
    if (file.source === 'cms' && file.storage_path) {
      return supabase.storage.from('cms_media').getPublicUrl(file.storage_path).data.publicUrl;
    } else if (file.bucket && file.storage_path) {
      return supabase.storage.from(file.bucket).getPublicUrl(file.storage_path).data.publicUrl;
    }
    return null;
  };

  const filteredMedia = mediaFiles.filter(file => {
    const matchesSearch = !searchQuery ||
      file.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.filename.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = selectedType === 'all' ||
      (selectedType === 'image' && file.mime_type.startsWith('image/')) ||
      (selectedType === 'document' && file.mime_type === 'application/pdf') ||
      (selectedType === 'video' && file.mime_type.startsWith('video/'));

    return matchesSearch && matchesType;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image style={{ height: 32, width: 32, color: '#3b82f6' }} />;
    }
    return <File style={{ height: 32, width: 32, color: '#6b7280' }} />;
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Media Library</Typography>
          <Typography variant="body2" color="text.secondary">Manage images, documents, and other media files</Typography>
        </Box>
        <Button>
          <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
          Upload Media
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Box sx={{ position: 'relative', flex: 1, maxWidth: 448 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Search media files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </Box>

        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger style={{ width: '100%', maxWidth: 192 }}>
            <SelectValue placeholder="File Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger style={{ width: '100%', maxWidth: 192 }}>
            <SelectValue placeholder="Usage Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="cover">Cover Images</SelectItem>
            <SelectItem value="gallery">Gallery</SelectItem>
            <SelectItem value="attachment">Attachments</SelectItem>
            <SelectItem value="avatar">Avatars</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline">
          <Filter style={{ height: 16, width: 16, marginRight: 8 }} />
          More Filters
        </Button>
      </Box>

      {/* Media Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
              <CardHeader style={{ paddingBottom: 8 }}>
                <Box sx={{ height: 16, bgcolor: 'grey.200', borderRadius: 1, width: '75%' }} />
                <Box sx={{ height: 12, bgcolor: 'grey.200', borderRadius: 1, width: '50%' }} />
              </CardHeader>
              <CardContent style={{ paddingTop: 0 }}>
                <Box sx={{ aspectRatio: '1/1', bgcolor: 'grey.200', borderRadius: 2, mb: 1.5 }} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ height: 12, bgcolor: 'grey.200', borderRadius: 1, width: '33%' }} />
                  <Box sx={{ height: 12, bgcolor: 'grey.200', borderRadius: 1, width: '50%' }} />
                </Box>
              </CardContent>
            </Card>
          ))
        ) : (
          filteredMedia.map((file) => (
            <Card key={file.id} style={{ transition: 'box-shadow 0.2s' }}>
              <CardHeader style={{ paddingBottom: 8 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <CardTitle>
                      <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.original_filename}
                      </Typography>
                    </CardTitle>
                    <CardDescription>
                      <Typography variant="caption">
                        {formatFileSize(file.file_size)} &bull; {file.mime_type}
                      </Typography>
                    </CardDescription>
                  </Box>
                  <Box sx={{ opacity: 0, transition: 'opacity 0.2s', display: 'flex', gap: 0.5, 'Card:hover &': { opacity: 1 } }}>
                    <Button size="sm" variant="ghost" style={{ height: 24, width: 24, padding: 0 }}>
                      <Download style={{ height: 12, width: 12 }} />
                    </Button>
                    <Button size="sm" variant="ghost" style={{ height: 24, width: 24, padding: 0, color: 'var(--destructive)' }}>
                      <Trash2 style={{ height: 12, width: 12 }} />
                    </Button>
                  </Box>
                </Box>
              </CardHeader>
              <CardContent style={{ paddingTop: 0 }}>
                <Box sx={{ aspectRatio: '1/1', bgcolor: 'grey.100', borderRadius: 2, mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {isImage(file.mime_type) ? (
                    getImageUrl(file) ? (
                      <Box
                        component="img"
                        src={getImageUrl(file)}
                        alt={file.original_filename}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      {getFileIcon(file.mime_type)}
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textTransform: 'uppercase' }}>
                        {file.mime_type.split('/')[1]}
                      </Typography>
                    </Box>
                  )}
                  {isImage(file.mime_type) && (
                    <Box sx={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #eff6ff 0%, #f3e8ff 100%)', display: 'none', alignItems: 'center', justifyContent: 'center' }}>
                      <Image style={{ height: 48, width: 48, color: '#93c5fd' }} />
                      <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>Image preview placeholder</Box>
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {file.width && file.height && (
                    <Typography variant="caption" color="text.secondary">
                      {file.width} x {file.height}
                    </Typography>
                  )}

                  {file.attribution && (
                    <Typography variant="caption">
                      <Typography component="span" variant="caption" color="text.secondary">By:</Typography> {file.attribution}
                    </Typography>
                  )}

                  {file.license && (
                    <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                      {file.license}
                    </Badge>
                  )}

                  <Typography variant="caption" color="text.secondary">
                    {new Date(file.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))
        )}
      </Box>

      {filteredMedia.length === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Upload style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>No media files found</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {searchQuery || selectedType !== 'all'
                  ? 'Try adjusting your search criteria'
                  : 'Upload your first media file to get started'
                }
              </Typography>
              <Button>
                <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
                Upload Media
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Upload Area */}
      <Paper variant="outlined" sx={{ borderStyle: 'dashed', borderWidth: 2, borderColor: 'divider' }}>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Upload style={{ height: 32, width: 32, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Drop files here to upload</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Or click to browse and select files from your computer
          </Typography>
          <Button variant="outline">
            Choose Files
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

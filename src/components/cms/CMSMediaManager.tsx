import { useState } from 'react';
import { Upload, Image, File, Trash2, Download, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CMSMediaManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');

  // Mock data - in production this would come from a hook
  const mediaFiles = [
    {
      id: '1',
      filename: 'hero-image.jpg',
      original_filename: 'Hero Image for Homepage.jpg',
      mime_type: 'image/jpeg',
      file_size: 2048000,
      width: 1920,
      height: 1080,
      created_at: '2024-01-15T10:00:00Z',
      alt_text: { en: 'Hero image for homepage' },
      attribution: 'John Doe Photography',
      license: 'CC BY 4.0',
    },
    {
      id: '2',
      filename: 'event-poster.png',
      original_filename: 'Pride Event Poster 2024.png',
      mime_type: 'image/png',
      file_size: 1024000,
      width: 800,
      height: 1200,
      created_at: '2024-01-14T14:30:00Z',
      alt_text: { en: 'Pride event poster' },
      attribution: 'Event Organizers',
      license: 'All Rights Reserved',
    },
    {
      id: '3',
      filename: 'venue-guide.pdf',
      original_filename: 'LGBTQ+ Venue Guide 2024.pdf',
      mime_type: 'application/pdf',
      file_size: 5120000,
      created_at: '2024-01-13T09:15:00Z',
      attribution: 'Community Team',
      license: 'CC BY-SA 4.0',
    },
  ];

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
      return <Image className="h-8 w-8 text-blue-500" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Media Library</h2>
          <p className="text-muted-foreground">Manage images, documents, and other media files</p>
        </div>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload Media
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search media files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-full sm:w-48">
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
          <SelectTrigger className="w-full sm:w-48">
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
          <Filter className="h-4 w-4 mr-2" />
          More Filters
        </Button>
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredMedia.map((file) => (
          <Card key={file.id} className="group hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-medium truncate">
                    {file.original_filename}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {formatFileSize(file.file_size)} • {file.mime_type}
                  </CardDescription>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                {isImage(file.mime_type) ? (
                  <div className="w-full h-full bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
                    <Image className="h-12 w-12 text-blue-300" />
                    <span className="sr-only">Image preview placeholder</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    {getFileIcon(file.mime_type)}
                    <span className="text-xs text-muted-foreground mt-2 uppercase">
                      {file.mime_type.split('/')[1]}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {file.width && file.height && (
                  <div className="text-xs text-muted-foreground">
                    {file.width} × {file.height}
                  </div>
                )}

                {file.attribution && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">By:</span> {file.attribution}
                  </div>
                )}

                {file.license && (
                  <Badge variant="outline" className="text-xs">
                    {file.license}
                  </Badge>
                )}

                <div className="text-xs text-muted-foreground">
                  {new Date(file.created_at).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredMedia.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No media files found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedType !== 'all' 
                ? 'Try adjusting your search criteria' 
                : 'Upload your first media file to get started'
              }
            </p>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload Media
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Area */}
      <Card className="border-dashed border-2 border-muted-foreground/25">
        <CardContent className="p-8 text-center">
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Drop files here to upload</h3>
          <p className="text-muted-foreground mb-4">
            Or click to browse and select files from your computer
          </p>
          <Button variant="outline">
            Choose Files
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
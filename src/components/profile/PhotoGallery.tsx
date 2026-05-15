import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Upload, X, Edit3, Trash2, Camera, ImageIcon, Loader2, ZoomIn } from 'lucide-react';
import { useUserPhotos } from '@/hooks/useUserPhotos';

interface PhotoGalleryProps {
  userId: string;
  isOwnProfile: boolean;
}

export function PhotoGallery({ userId, isOwnProfile }: PhotoGalleryProps) {
  const { photos, isLoading, uploadPhoto, deletePhoto, updateCaption, getSignedPhotoUrl } =
    useUserPhotos(userId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [editCaptionText, setEditCaptionText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    const loadUrls = async () => {
      const entries = await Promise.all(
        (photos || []).map(async (p) => {
          const url = await getSignedPhotoUrl(p.storage_path, 3600);
          return [p.storage_path, url || ''] as const;
        }),
      );
      if (isMounted) {
        const map: Record<string, string> = {};
        entries.forEach(([k, v]) => {
          if (v) map[k] = v;
        });
        setSignedUrls(map);
      }
    };
    loadUrls();
    return () => {
      isMounted = false;
    };
  }, [photos, getSignedPhotoUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await uploadPhoto.mutateAsync({ file: selectedFile, caption });
      setSelectedFile(null);
      setCaption('');
      setUploadOpen(false);
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (window.confirm('Are you sure you want to delete this photo?')) {
      await deletePhoto.mutateAsync(photoId);
    }
  };

  const handleEditCaption = (photoId: string, currentCaption: string) => {
    setEditingCaption(photoId);
    setEditCaptionText(currentCaption || '');
  };

  const handleSaveCaption = async (photoId: string) => {
    await updateCaption.mutateAsync({ photoId, caption: editCaptionText });
    setEditingCaption(null);
    setEditCaptionText('');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            <h6 className="text-base font-semibold">Photo Gallery</h6>
            {photos && photos.length > 0 && <Badge variant="secondary">{photos.length}</Badge>}
          </div>
          {isOwnProfile && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Photo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Photo</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="photo-upload">Choose Photo</Label>
                    <div className="mt-2">
                      <Input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                      />
                    </div>
                  </div>

                  {selectedFile && (
                    <div className="flex flex-col gap-4">
                      <div className="relative">
                        <img
                          src={URL.createObjectURL(selectedFile)}
                          alt="Preview"
                          className="w-full h-48 object-cover rounded"
                        />
                      </div>

                      <div>
                        <Label htmlFor="caption">Caption (optional)</Label>
                        <Textarea
                          id="caption"
                          value={caption}
                          onChange={(e) => setCaption(e.target.value)}
                          placeholder="Add a caption to your photo..."
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setUploadOpen(false);
                        setSelectedFile(null);
                        setCaption('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploadPhoto.isPending}
                    >
                      {uploadPhoto.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Upload
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!photos || photos.length === 0 ? (
          <div className="text-center py-8">
            <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h6 className="text-base font-medium mb-2">No photos yet</h6>
            <p className="text-sm text-muted-foreground">
              {isOwnProfile
                ? 'Upload your first photo to get started'
                : "This user hasn't uploaded any photos yet"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <div
                  className="aspect-square overflow-hidden rounded-element bg-muted cursor-pointer"
                  onClick={async () => {
                    const existing = signedUrls[photo.storage_path];
                    if (existing) {
                      setSelectedImage(existing);
                    } else {
                      const url = await getSignedPhotoUrl(photo.storage_path, 3600);
                      if (url) setSelectedImage(url);
                    }
                  }}
                >
                  <img
                    src={signedUrls[photo.storage_path] || ''}
                    alt={photo.caption || 'User photo'}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <ZoomIn className="w-6 h-6 text-primary-foreground" />
                  </div>
                </div>

                {photo.caption && (
                  <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {editingCaption === photo.id ? (
                      <div className="flex flex-col gap-2">
                        <Textarea
                          value={editCaptionText}
                          onChange={(e) => setEditCaptionText(e.target.value)}
                          className="text-xs"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveCaption(photo.id)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCaption(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      photo.caption
                    )}
                  </div>
                )}

                {isOwnProfile && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEditCaption(photo.id, photo.caption || '')}
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0"
                        onClick={() => handleDeletePhoto(photo.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Image Lightbox */}
        {selectedImage && (
          <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
            <DialogContent className="max-w-4xl">
              <div className="relative">
                <img
                  src={selectedImage}
                  alt="Full size photo"
                  className="w-full max-h-[80vh] object-contain"
                />
                <Button
                  className="absolute top-2 right-2"
                  variant="secondary"
                  size="icon"
                  onClick={() => setSelectedImage(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

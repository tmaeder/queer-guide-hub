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
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PhotoGalleryProps {
  userId: string;
  isOwnProfile: boolean;
}

export function PhotoGallery({ userId, isOwnProfile }: PhotoGalleryProps) {
  const {} = useAuth();
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
        <CardContent style={{ padding: 24 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 128 }}
          >
            <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Camera style={{ width: 20, height: 20 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Photo Gallery
            </Typography>
            {photos && photos.length > 0 && <Badge variant="secondary">{photos.length}</Badge>}
          </Box>
          {isOwnProfile && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
                  Add Photo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Photo</DialogTitle>
                </DialogHeader>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div>
                    <Label htmlFor="photo-upload">Choose Photo</Label>
                    <Box sx={{ mt: 1 }}>
                      <Input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                      />
                    </Box>
                  </div>

                  {selectedFile && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ position: 'relative' }}>
                        <Box
                          component="img"
                          src={URL.createObjectURL(selectedFile)}
                          alt="Preview"
                          sx={{ width: '100%', height: 192, objectFit: 'cover', borderRadius: 1 }}
                        />
                      </Box>

                      <div>
                        <Label htmlFor="caption">Caption (optional)</Label>
                        <Textarea
                          id="caption"
                          value={caption}
                          onChange={(e) => setCaption(e.target.value)}
                          placeholder="Add a caption to your photo..."
                          style={{ marginTop: 4 }}
                        />
                      </div>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
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
                        <Loader2
                          style={{
                            width: 16,
                            height: 16,
                            animation: 'spin 1s linear infinite',
                            marginRight: 8,
                          }}
                        />
                      ) : (
                        <Upload style={{ width: 16, height: 16, marginRight: 8 }} />
                      )}
                      Upload
                    </Button>
                  </Box>
                </Box>
              </DialogContent>
            </Dialog>
          )}
        </Box>

        {!photos || photos.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <ImageIcon
              style={{
                width: 48,
                height: 48,
                margin: '0 auto',
                marginBottom: 16,
                color: 'var(--muted-foreground)',
              }}
            />
            <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>
              No photos yet
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {isOwnProfile
                ? 'Upload your first photo to get started'
                : "This user hasn't uploaded any photos yet"}
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 2,
            }}
          >
            {photos.map((photo) => (
              <Box
                key={photo.id}
                sx={{
                  position: 'relative',
                  '&:hover .photo-overlay': { opacity: 1 },
                  '&:hover .photo-actions': { opacity: 1 },
                  '&:hover img': { transform: 'scale(1.05)' },
                }}
              >
                <Box
                  sx={{
                    aspectRatio: '1',
                    overflow: 'hidden',
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    cursor: 'pointer',
                  }}
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
                  <Box
                    component="img"
                    src={signedUrls[photo.storage_path] || ''}
                    alt={photo.caption || 'User photo'}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.2s',
                    }}
                  />
                  <Box
                    className="photo-overlay"
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      bgcolor: 'rgba(0,0,0,0)',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.2)' },
                      transition: 'background-color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                    }}
                  >
                    <ZoomIn style={{ width: 24, height: 24, color: 'var(--primary-foreground)' }} />
                  </Box>
                </Box>

                {photo.caption && (
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 1,
                      color: 'text.secondary',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {editingCaption === photo.id ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Textarea
                          value={editCaptionText}
                          onChange={(e) => setEditCaptionText(e.target.value)}
                          style={{ fontSize: '0.75rem' }}
                          rows={2}
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
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
                        </Box>
                      </Box>
                    ) : (
                      photo.caption
                    )}
                  </Typography>
                )}

                {isOwnProfile && (
                  <Box
                    className="photo-actions"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        style={{ height: 32, width: 32, padding: 0 }}
                        onClick={() => handleEditCaption(photo.id, photo.caption || '')}
                      >
                        <Edit3 style={{ width: 12, height: 12 }} />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        style={{ height: 32, width: 32, padding: 0 }}
                        onClick={() => handleDeletePhoto(photo.id)}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Image Lightbox */}
        {selectedImage && (
          <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
            <DialogContent style={{ maxWidth: 896 }}>
              <Box sx={{ position: 'relative' }}>
                <Box
                  component="img"
                  src={selectedImage}
                  alt="Full size photo"
                  sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                />
                <Button
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  variant="secondary"
                  size="icon"
                  onClick={() => setSelectedImage(null)}
                >
                  <X style={{ width: 16, height: 16 }} />
                </Button>
              </Box>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/integrations/api/client";
import { Upload, X, ImagePlus } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

interface VenueImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export const VenueImageUpload = ({ 
  images, 
  onChange, 
  maxImages = 8 
}: VenueImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;

    if (images.length + files.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can only upload up to ${maxImages} images`,
        variant: "destructive"
      });
      return;
    }

    // Validate each file
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select only image files (PNG, JPG, WebP)",
          variant: "destructive"
        });
        return;
      }

      // Validate file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 20MB",
          variant: "destructive"
        });
        return;
      }
    }

    setUploading(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `venue-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `venues/${fileName}`;

        const { error: uploadError } = await api.storage
          .from('city-images')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = api.storage
          .from('city-images')
          .getPublicUrl(filePath);

        return publicUrl;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      const newImages = [...images, ...uploadedUrls];
      onChange(newImages);

      toast({
        title: "Success",
        description: `${files.length} image(s) uploaded successfully`
      });

    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = (indexToRemove: number) => {
    const newImages = images.filter((_, index) => index !== indexToRemove);
    onChange(newImages);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Label>Venue Images (Optional)</Label>

      {/* Upload Area */}
      <Paper
        sx={{
          border: 2,
          borderStyle: 'dashed',
          borderColor: 'divider',
          transition: 'border-color 0.2s',
          '&:hover': { borderColor: 'primary.main', opacity: 0.5 }
        }}
      >
        <Box sx={{ p: 3 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading || images.length >= maxImages}
          />

          <Box
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={triggerFileInput}
          >
            <Box sx={{ mb: 2 }}>
              <ImagePlus style={{ width: 48, height: 48, color: 'var(--muted-foreground)' }} />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {uploading ? "Uploading..." : "Click to upload venue images"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                PNG, JPG, WebP up to 20MB (max {maxImages} images)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {images.length}/{maxImages} images uploaded
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Image Previews */}
      {images.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {images.map((imageUrl, index) => (
            <Box key={index} sx={{ position: 'relative' }}>
              <Box sx={{ aspectRatio: '1', borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover' }}>
                <Box
                  component="img"
                  src={imageUrl}
                  alt={`Venue image ${index + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder.svg';
                  }}
                />
              </Box>
              <Button
                variant="destructive"
                size="sm"
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  '&:hover': { opacity: 1 },
                  '.group:hover &': { opacity: 1 }
                }}
                onClick={() => removeImage(index)}
              >
                <X style={{ width: 12, height: 12 }} />
              </Button>
            </Box>
          ))}
        </Box>
      )}

      {images.length >= maxImages && (
        <Typography variant="caption" color="text.secondary">
          Maximum number of images reached. Remove an image to upload more.
        </Typography>
      )}
    </Box>
  );
};
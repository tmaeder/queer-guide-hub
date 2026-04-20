import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/uploadErrors";
import { supabase } from "@/integrations/supabase/client";
import { X, ImagePlus } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface EventImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
}

export const EventImageUpload = ({
  images,
  onChange,
  maxImages = 5
}: EventImageUploadProps) => {
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

      if (file.size > MAX_UPLOAD_BYTES) {
        toast({
          title: "File too large",
          description: `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed size is ${MAX_UPLOAD_MB} MB.`,
          variant: "destructive"
        });
        return;
      }
    }

    setUploading(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `event-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `events/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('city-images')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
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
      <Label>Event Images (Optional)</Label>

      {/* Upload Area */}
      <Card>
        <CardContent>
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
              <ImagePlus style={{ height: 48, width: 48, color: 'var(--muted-foreground)' }} />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {uploading ? "Uploading..." : "Click to upload event images"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                PNG, JPG, WebP up to 20MB (max {maxImages} images)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {images.length}/{maxImages} images uploaded
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Image Previews */}
      {images.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {images.map((imageUrl, index) => (
            <Box key={index} sx={{ position: 'relative', '&:hover .remove-button': { opacity: 1 } }}>
              <Box sx={{ aspectRatio: '16/9', borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover' }}>
                <Box
                  component="img"
                  src={imageUrl}
                  alt={`Event image ${index + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
              </Box>
              <Button
                variant="destructive"
                size="sm"

                className="remove-button"
                onClick={() => removeImage(index)}
              >
                <X style={{ height: 12, width: 12 }} />
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

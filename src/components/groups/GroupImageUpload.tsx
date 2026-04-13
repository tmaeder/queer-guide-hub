import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface GroupImageUploadProps {
  currentImages?: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
}

export const GroupImageUpload = ({
  currentImages = [],
  onImagesChange,
  maxImages = 5
}: GroupImageUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = maxImages - currentImages.length;
    if (remainingSlots <= 0) {
      toast({
        title: "Upload limit reached",
        description: `You can only upload up to ${maxImages} images.`,
        variant: "destructive",
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `group-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('user-photos')
          .getPublicUrl(filePath);

        return publicUrl;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      const newImages = [...currentImages, ...uploadedUrls];
      onImagesChange(newImages);

      toast({
        title: "Images uploaded successfully",
        description: `${uploadedUrls.length} image(s) uploaded.`,
      });
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (indexToRemove: number) => {
    const newImages = currentImages.filter((_, index) => index !== indexToRemove);
    onImagesChange(newImages);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label>Group Images ({currentImages.length}/{maxImages})</Label>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            disabled={isUploading || currentImages.length >= maxImages}
            sx={{ display: 'none' }}
            id="group-image-upload"
          />
          <Label
            htmlFor="group-image-upload"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 6,
              cursor: isUploading || currentImages.length >= maxImages ? 'not-allowed' : 'pointer',
              opacity: isUploading || currentImages.length >= maxImages ? 0.5 : 1,
              transition: 'background-color 0.2s',
            }}
          >
            {isUploading ? (
              <>
                <Box sx={{ width: 16, height: 16, border: 2, borderColor: 'primary.main', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />
                Uploading...
              </>
            ) : (
              <>
                <Upload style={{ height: 16, width: 16 }} />
                Upload Images
              </>
            )}
          </Label>
        </Box>
        {currentImages.length >= maxImages && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Maximum number of images reached.
          </Typography>
        )}
      </Box>

      {currentImages.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {currentImages.map((imageUrl, index) => (
            <Box key={index} sx={{ position: 'relative', '&:hover .remove-btn': { opacity: 1 } }}>
              <Box sx={{ aspectRatio: '1', overflow: 'hidden' }}>
                <Box
                  component="img"
                  src={imageUrl}
                  alt={`Group image ${index + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder.svg';
                  }}
                />
              </Box>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="remove-btn"
                sx={{ position: 'absolute', top: 1, right: 1, opacity: 0, transition: 'opacity 0.2s', height: 24, width: 24, p: 0 }}
                onClick={() => removeImage(index)}
              >
                <X style={{ height: 12, width: 12 }} />
              </Button>
            </Box>
          ))}
        </Box>
      )}

      {currentImages.length === 0 && (
        <Box sx={{ border: 2, borderStyle: 'dashed', borderColor: 'text.disabled', borderRadius: 2, p: 4, textAlign: 'center' }}>
          <ImageIcon style={{ width: 48, height: 48, margin: '0 auto', marginBottom: 16, opacity: 0.5 }} />
          <Typography sx={{ color: 'text.secondary' }}>No images uploaded yet</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Upload images to showcase your group</Typography>
        </Box>
      )}
    </Box>
  );
};

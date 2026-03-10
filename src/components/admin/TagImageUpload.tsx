import { useState } from "react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/integrations/api/client";
import { Upload, X, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TagImageUploadProps {
  currentImageUrl?: string;
  onImageChange: (imageUrl: string | null) => void;
  tagName?: string;
}

export const TagImageUpload = ({
  currentImageUrl,
  onImageChange,
  tagName
}: TagImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
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

    setUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await api.storage
        .from('tag-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = api.storage
        .from('tag-images')
        .getPublicUrl(data.path);

      const imageUrl = urlData.publicUrl;
      setPreviewUrl(imageUrl);
      onImageChange(imageUrl);

      toast({
        title: "Success",
        description: "Image uploaded successfully"
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    if (currentImageUrl) {
      try {
        // Extract filename from URL
        const urlParts = currentImageUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];

        // Delete from storage
        await api.storage
          .from('tag-images')
          .remove([fileName]);
      } catch (error) {
        console.error('Delete error:', error);
      }
    }

    setPreviewUrl(null);
    onImageChange(null);

    toast({
      title: "Success",
      description: "Image deleted successfully"
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Label>Tag Image</Label>

      {previewUrl ? (
        <Box sx={{ position: 'relative' }}>
          <Box sx={{ width: '100%', height: 128, borderRadius: 2, overflow: 'hidden', bgcolor: 'grey.100' }}>
            <img
              src={previewUrl}
              alt={tagName || "Tag image"}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Box>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            sx={{ position: 'absolute', top: 8, right: 8 }}
            onClick={handleDeleteImage}
          >
            <X style={{ width: 16, height: 16 }} />
          </Button>
        </Box>
      ) : (
        <Box sx={{ width: '100%' }}>
          <Box sx={{ borderRadius: 2, p: 3, textAlign: 'center', bgcolor: 'action.hover' }}>
            <Image style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Upload an image for this tag
              </Typography>
              <Typography variant="caption" color="text.secondary">
                PNG, JPG, WebP up to 20MB
              </Typography>
            </Box>
          </Box>

          <Input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            sx={{ mt: 1 }}
          />
        </Box>
      )}

      {uploading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Upload style={{ width: 16, height: 16, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
          <Typography variant="body2" color="text.secondary">Uploading image...</Typography>
        </Box>
      )}
    </Box>
  );
};

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Image } from "lucide-react";
import { toast } from 'sonner';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/uploadErrors";

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type: Please select an image file');
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

    setUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('tag-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('tag-images')
        .getPublicUrl(data.path);

      const imageUrl = urlData.publicUrl;
      setPreviewUrl(imageUrl);
      onImageChange(imageUrl);

      toast.success('Success: Image uploaded successfully');

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed: Failed to upload image. Please try again.');
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
        await supabase.storage
          .from('tag-images')
          .remove([fileName]);
      } catch (error) {
        console.error('Delete error:', error);
      }
    }

    setPreviewUrl(null);
    onImageChange(null);

    toast.success('Success: Image deleted successfully');
  };

  return (
    <div className="flex flex-col gap-4">
      <Label>Tag Image</Label>

      {previewUrl ? (
        <div className="relative">
          <div className="w-full overflow-hidden bg-muted" style={{ height: 128 }}>
            <img
              src={previewUrl}
              alt={tagName || "Tag image"}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={handleDeleteImage}>
            <X style={{ width: 16, height: 16 }} />
          </Button>
        </div>
      ) : (
        <div className="w-full">
          <div className="p-6 text-center bg-muted">
            <Image style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Upload an image for this tag</p>
              <span className="text-xs text-muted-foreground">PNG, JPG, WebP up to 20MB</span>
            </div>
          </div>

          <Input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2">
          <Upload className="animate-pulse" style={{ width: 16, height: 16 }} />
          <p className="text-sm text-muted-foreground">Uploading image...</p>
        </div>
      )}
    </div>
  );
};

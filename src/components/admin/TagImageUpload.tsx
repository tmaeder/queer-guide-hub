import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
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

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
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

  const handleRemoveImage = async () => {
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
    
    toast({
      title: "Success",
      description: "Image removed successfully"
    });
  };

  return (
    <div className="space-y-4">
      <Label>Tag Image</Label>
      
      {previewUrl ? (
        <div className="relative">
          <div className="w-full h-32 border-2 border-dashed border-muted rounded-lg overflow-hidden">
            <img 
              src={previewUrl} 
              alt={tagName || "Tag image"} 
              className="w-full h-full object-cover"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={handleRemoveImage}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="w-full">
          <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
            <Image className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload an image for this tag
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP up to 5MB
              </p>
            </div>
          </div>
          
          <Input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="mt-2"
          />
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Upload className="h-4 w-4 animate-pulse" />
          Uploading image...
        </div>
      )}
    </div>
  );
};
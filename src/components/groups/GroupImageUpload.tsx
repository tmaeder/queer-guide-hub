import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GroupImageUploadProps {
  currentImages?: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
}

export const GroupImageUpload = ({
  currentImages = [],
  onImagesChange,
  maxImages = 5,
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

  const disabled = isUploading || currentImages.length >= maxImages;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Group Images ({currentImages.length}/{maxImages})</Label>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            disabled={disabled}
            id="group-image-upload"
          />
          <Label
            htmlFor="group-image-upload"
            className="flex items-center gap-2 px-4 py-2 transition-colors"
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload style={{ height: 16, width: 16 }} />
                Upload Images
              </>
            )}
          </Label>
        </div>
        {currentImages.length >= maxImages && (
          <p className="text-sm text-muted-foreground">Maximum number of images reached.</p>
        )}
      </div>

      {currentImages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {currentImages.map((imageUrl, index) => (
            <div key={index} className="relative group">
              <div className="overflow-hidden" style={{ aspectRatio: '1' }}>
                <img
                  src={imageUrl}
                  alt=""
                  role="presentation"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder.svg';
                  }}
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => removeImage(index)}
              >
                <X style={{ height: 12, width: 12 }} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {currentImages.length === 0 && (
        <div className="border-2 border-dashed p-8 text-center" style={{ borderColor: 'hsl(var(--muted-foreground) / 0.3)' }}>
          <ImageIcon style={{ width: 48, height: 48, margin: '0 auto', marginBottom: 16, opacity: 0.5 }} />
          <p className="text-muted-foreground">No images uploaded yet</p>
          <p className="text-sm text-muted-foreground">Upload images to showcase your group</p>
        </div>
      )}
    </div>
  );
};

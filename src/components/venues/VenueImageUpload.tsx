import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/uploadErrors";
import { supabase } from "@/integrations/supabase/client";
import { X, ImagePlus } from "lucide-react";

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
        const fileName = `venue-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `venues/${fileName}`;

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
    <div className="flex flex-col gap-4">
      <Label>Venue Images (Optional)</Label>

      <div className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-element">
        <div className="p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || images.length >= maxImages}
          />

          <button
            type="button"
            className="flex flex-col items-center justify-center cursor-pointer w-full bg-transparent border-0 p-0"
            onClick={triggerFileInput}
            disabled={uploading || images.length >= maxImages}
          >
            <div className="mb-4">
              <ImagePlus className="w-12 h-12 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploading ? "Uploading..." : "Click to upload venue images"}
              </p>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, WebP up to 20MB (max {maxImages} images)
              </span>
              <span className="text-xs text-muted-foreground mt-2 block">
                {images.length}/{maxImages} images uploaded
              </span>
            </div>
          </button>
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((imageUrl, index) => (
            <div key={index} className="relative">
              <div className="aspect-square rounded-element overflow-hidden bg-muted">
                <img
                  src={imageUrl}
                  alt={`Venue ${index + 1}`}
                  role="presentation"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder.svg';
                  }}
                />
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {images.length >= maxImages && (
        <span className="text-xs text-muted-foreground">
          Maximum number of images reached. Remove an image to upload more.
        </span>
      )}
    </div>
  );
};

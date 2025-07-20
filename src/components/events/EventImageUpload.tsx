import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, ImagePlus } from "lucide-react";

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
    <div className="space-y-4">
      <Label>Event Images (Optional)</Label>
      
      {/* Upload Area */}
      <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
        <CardContent className="p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || images.length >= maxImages}
          />
          
          <div 
            className="flex flex-col items-center justify-center cursor-pointer"
            onClick={triggerFileInput}
          >
            <div className="mb-4">
              <ImagePlus className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploading ? "Uploading..." : "Click to upload event images"}
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP up to 20MB (max {maxImages} images)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {images.length}/{maxImages} images uploaded
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Image Previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((imageUrl, index) => (
            <div key={index} className="relative group">
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                <img
                  src={imageUrl}
                  alt={`Event image ${index + 1}`}
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
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {images.length >= maxImages && (
        <p className="text-xs text-muted-foreground">
          Maximum number of images reached. Remove an image to upload more.
        </p>
      )}
    </div>
  );
};
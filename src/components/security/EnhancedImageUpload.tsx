import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EnhancedImageUploadProps {
  onUpload: (url: string) => void;
  onRemove?: () => void;
  currentImage?: string;
  bucket?: string;
  maxSize?: number;
  className?: string;
}

export function EnhancedImageUpload({
  onUpload,
  onRemove,
  currentImage,
  bucket = 'cms-media',
  maxSize = 10485760,
  className = ''
}: EnhancedImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const { toast } = useToast();

  const validateFile = useCallback(async (file: File) => {
    setValidationErrors([]);

    const { data: validation, error } = await supabase.rpc('validate_file_upload', {
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type
    });

    if (error) {
      console.error('File validation error:', error);
      throw new Error('File validation failed');
    }

    const result = validation as { is_valid: boolean; errors: string[] };
    if (!result.is_valid) {
      setValidationErrors(result.errors);
      return false;
    }

    return true;
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);

    try {
      const isValid = await validateFile(file);
      if (!isValid) {
        setUploading(false);
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      onUpload(urlData.publicUrl);

      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    } catch (error: unknown) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [validateFile, bucket, onUpload, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    maxSize: maxSize,
    disabled: uploading
  });

  const handleRemove = useCallback(async () => {
    if (currentImage && onRemove) {
      try {
        const url = new URL(currentImage);
        const pathParts = url.pathname.split('/');
        const fileName = pathParts[pathParts.length - 1];

        if (fileName) {
          await supabase.storage.from(bucket).remove([fileName]);
        }

        onRemove();
        toast({
          title: "Success",
          description: "Image removed successfully",
        });
      } catch (error) {
        console.error('Remove error:', error);
        toast({
          title: "Error",
          description: "Failed to remove image",
          variant: "destructive",
        });
      }
    }
  }, [currentImage, onRemove, bucket, toast]);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside flex flex-col gap-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {currentImage ? (
        <div className="relative group">
          <img
            src={currentImage}
            alt=""
            className="w-full h-48 object-cover bg-muted"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
            >
              <X className="h-4 w-4 mr-2" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed p-8 text-center transition-all ${
            uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          } ${
            isDragActive
              ? 'border-primary bg-primary/10'
              : 'border-border bg-muted hover:border-primary hover:bg-accent'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop image here' : 'Click or drag image to upload'}
            </p>
            <span className="text-xs text-muted-foreground">
              Supports: JPEG, PNG, GIF, WebP (max {Math.round(maxSize / 1024 / 1024)}MB)
            </span>
          </div>
          {uploading && (
            <div className="mt-4">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              <span className="text-xs text-muted-foreground mt-2 block">Uploading...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

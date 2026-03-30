import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface EnhancedImageUploadProps {
  onUpload: (url: string) => void;
  onRemove?: () => void;
  currentImage?: string;
  bucket?: string;
  maxSize?: number; // in bytes
  className?: string;
}

export function EnhancedImageUpload({
  onUpload,
  onRemove,
  currentImage,
  bucket = 'cms-media',
  maxSize = 10485760, // 10MB
  className = ''
}: EnhancedImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const { toast } = useToast();

  const validateFile = useCallback(async (file: File) => {
    setValidationErrors([]);

    // Call database validation function
    const { data: validation, error } = await supabase.rpc('validate_file_upload', {
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type
    });

    if (error) {
      console.error('File validation error:', error);
      throw new Error('File validation failed');
    }

      const result = validation as any;
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
      // Validate file first
      const isValid = await validateFile(file);
      if (!isValid) {
        setUploading(false);
        return;
      }

      // Create unique filename to prevent conflicts
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      onUpload(urlData.publicUrl);

      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
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
        // Extract filename from URL to delete from storage
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} className={className}>
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle style={{ height: 16, width: 16 }} />
          <AlertDescription>
            <Box component="ul" sx={{ listStyle: 'disc', listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </Box>
          </AlertDescription>
        </Alert>
      )}

      {currentImage ? (
        <Box sx={{ position: 'relative', '&:hover .overlay': { opacity: 1 } }}>
          <Box
            component="img"
            src={currentImage}
            alt="Uploaded image"
            sx={{ width: '100%', height: 192, objectFit: 'cover', bgcolor: 'action.hover' }}
          />
          <Box
            className="overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'rgba(0,0,0,0.5)',
              opacity: 0,
              transition: 'opacity 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
            >
              <X style={{ height: 16, width: 16, marginRight: 8 }} />
              Remove
            </Button>
          </Box>
        </Box>
      ) : (
        <Box
          {...getRootProps()}
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: isDragActive ? 'primary.main' : 'divider',
            bgcolor: isDragActive ? 'primary.light' : 'action.hover',
            p: 4,
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: uploading ? 0.5 : 1,
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'action.selected'
            }
          }}
        >
          <input {...getInputProps()} />
          <Upload style={{ height: 48, width: 48, marginLeft: 'auto', marginRight: 'auto', marginBottom: 16, color: 'var(--muted-foreground)' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {isDragActive ? 'Drop image here' : 'Click or drag image to upload'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Supports: JPEG, PNG, GIF, WebP (max {Math.round(maxSize / 1024 / 1024)}MB)
            </Typography>
          </Box>
          {uploading && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ animation: 'spin 1s linear infinite', height: 24, width: 24, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%', mx: 'auto' }} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>Uploading...</Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

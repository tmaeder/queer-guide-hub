import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';

interface ImageUploadProps {
  value?: string;
  onValueChange: (url: string) => void;
  label?: string;
  required?: boolean;
  id?: string;
  accept?: string;
  maxSize?: number; // in MB
}

export function ImageUpload({
  value,
  onValueChange,
  label = 'Upload Image',
  required,
  id,
  accept = 'image/*',
  maxSize = 5, // 5MB default
}: ImageUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { validateFileUpload } = useSecurityValidation();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > maxSize * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: `Please select an image smaller than ${maxSize}MB`,
        variant: 'destructive',
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be logged in to upload files',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      // Validate file security first
      const validation = await validateFileUpload(file.name, file.size, file.type);
      if (!validation.is_valid) {
        throw new Error(validation.errors.join(', '));
      }

      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage.from('cms-media').upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        console.error('Upload error:', error);
        toast({
          title: 'Upload failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('cms-media').getPublicUrl(data.path);

      setPreview(publicUrl);
      onValueChange(publicUrl);

      toast({
        title: 'Upload successful',
        description: 'Your image has been uploaded successfully',
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: 'Upload failed',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      // Clear the input value to allow uploading the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      // Extract the file path from the URL
      const url = new URL(value);
      const pathParts = url.pathname.split('/');
      const filePath = pathParts.slice(-2).join('/'); // Get user_id/filename

      // Delete from storage
      const { error } = await supabase.storage.from('cms-media').remove([filePath]);

      if (error) {
        console.error('Delete error:', error);
      }
    } catch (error) {
      console.error('Error parsing URL for deletion:', error);
    }

    setPreview(null);
    onValueChange('');
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ flexDirection: 'column' }} className="flex gap-2">
      {label && (
        <Label htmlFor={id} style={{ alignItems: 'center' }} className="flex gap-2">
          <ImageIcon size={16} />
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        id={id}
      />

      {preview ? (
        <Card className="relative">
          <CardContent className="p-4">
            <div
              role="presentation"
              className="relative"
              onMouseEnter={(e) => {
                const overlay = e.currentTarget.querySelector('[data-overlay]') as HTMLElement;
                if (overlay) overlay.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                const overlay = e.currentTarget.querySelector('[data-overlay]') as HTMLElement;
                if (overlay) overlay.style.opacity = '0';
              }}
            >
              <img
                src={preview}
                alt="Preview"
                style={{
                  width: '100%',
                  height: 192,
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-element)',
                }}
              />
              <div
                data-overlay=""
                style={{
                  inset: 0,
                  backgroundColor: 'hsl(var(--foreground) / 0.5)',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  borderRadius: 'var(--radius-element)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className="absolute flex"
              >
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleClick} disabled={uploading}>
                    <Upload size={16} className="mr-2" />
                    Replace
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleRemove}>
                    <X size={16} className="mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          style={{ borderStyle: 'dashed', transition: 'background-color 0.2s' }}
          className="cursor-pointer"
          onClick={handleClick}
        >
          <CardContent className="p-8 text-center">
            {uploading ? (
              <div style={{ flexDirection: 'column', alignItems: 'center' }} className="flex gap-2">
                <Loader2
                  size={32}
                  style={{ animation: 'spin 1s linear infinite' }}
                  className="text-muted-foreground"
                />
                <p className="text-sm text-muted-foreground m-0">Uploading...</p>
              </div>
            ) : (
              <div style={{ flexDirection: 'column', alignItems: 'center' }} className="flex gap-2">
                <Upload size={32} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground m-0">Click to upload an image</p>
                <p className="text-xs text-muted-foreground m-0">Max size: {maxSize}MB</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

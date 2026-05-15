/**
 * MediaUploader
 * Drag-and-drop file upload component with preview and progress indicator.
 * Uses react-dropzone for DnD and useCMSMedia for the actual upload.
 */

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import type { CMSMedia } from '@/types/cms';

interface MediaUploaderProps {
  onUploaded: (media: CMSMedia) => void;
  bucket?: string;
  accept?: string;
}

export default function MediaUploader({ onUploaded, bucket, accept }: MediaUploaderProps) {
  const { uploadMedia } = useCMSMedia();
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string | null } | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      setErrorMsg(null);

      let previewUrl: string | null = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      setPreview({ file, url: previewUrl });
    },
    [],
  );

  const handleUpload = async () => {
    if (!preview) return;
    setUploading(true);
    setErrorMsg(null);

    try {
      const result = await uploadMedia(preview.file, bucket);
      if (result) {
        if (preview.url) URL.revokeObjectURL(preview.url);
        setPreview(null);
        onUploaded(result);
      } else {
        setErrorMsg('Upload failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleClearPreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setErrorMsg(null);
  };

  const dropzoneAccept: Record<string, string[]> | undefined = accept
    ? { [accept]: [] }
    : undefined;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: dropzoneAccept,
    multiple: false,
    disabled: uploading,
  });

  if (preview) {
    return (
      <div className="border border-border rounded-badge p-4 bg-muted/30">
        {errorMsg && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-row gap-4 items-center">
          {preview.url ? (
            <img
              src={preview.url}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-badge border border-border"
            />
          ) : (
            <div className="w-20 h-20 flex items-center justify-center bg-muted rounded-badge">
              <FileText size={32} className="text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{preview.file.name}</p>
            <span className="text-xs text-muted-foreground">
              {preview.file.type || 'Unknown type'} &middot;{' '}
              {(preview.file.size / 1024).toFixed(1)} KB
            </span>
          </div>

          {!uploading && (
            <Button variant="ghost" size="sm" onClick={handleClearPreview} className="h-7 w-7 p-0">
              <X size={16} />
            </Button>
          )}
        </div>

        <div className="flex flex-row gap-2 justify-end mt-4">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearPreview}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Upload size={16} className="mr-2" />
            )}
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {errorMsg && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-badge p-8 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted'
        }`}
      >
        <input {...getInputProps()} />

        <Upload
          size={32}
          className={`mx-auto mb-2 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`}
        />

        {isDragActive ? (
          <p className="text-sm text-primary font-medium">Drop the file here</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Drag and drop a file here, or click to browse
            </p>
            {accept && (
              <span className="text-xs text-muted-foreground/70 mt-1 block">
                Accepted: {accept}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

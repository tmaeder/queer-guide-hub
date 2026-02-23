/**
 * MediaUploader
 * Drag-and-drop file upload component with preview and progress indicator.
 * Uses react-dropzone for DnD and useCMSMedia for the actual upload.
 */

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Stack,
  Alert,
  IconButton,
} from '@mui/material';
import { Upload, X, Image as ImageIcon, FileText } from 'lucide-react';
import { useCMSMedia } from '@/hooks/useCMSMedia';
import type { CMSMedia } from '@/types/cms';

interface MediaUploaderProps {
  /** Called after a file is successfully uploaded */
  onUploaded: (media: CMSMedia) => void;
  /** Supabase storage bucket (defaults to 'cms-media') */
  bucket?: string;
  /** Accept filter string, e.g. "image/*" */
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

      // Build preview URL for images
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
        // Clean up preview URL
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

  // Parse accept string into dropzone accept format
  const dropzoneAccept: Record<string, string[]> | undefined = accept
    ? { [accept]: [] }
    : undefined;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: dropzoneAccept,
    multiple: false,
    disabled: uploading,
  });

  // If we already have a file selected, show preview instead of dropzone
  if (preview) {
    return (
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 2,
          bgcolor: 'grey.50',
        }}
      >
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <Stack direction="row" spacing={2} alignItems="center">
          {preview.url ? (
            <Box
              component="img"
              src={preview.url}
              alt="Preview"
              sx={{
                width: 80,
                height: 80,
                objectFit: 'cover',
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
              }}
            />
          ) : (
            <Box
              sx={{
                width: 80,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.200',
                borderRadius: 1,
              }}
            >
              <FileText size={32} className="text-gray-400" />
            </Box>
          )}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {preview.file.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {preview.file.type || 'Unknown type'} &middot;{' '}
              {(preview.file.size / 1024).toFixed(1)} KB
            </Typography>
          </Box>

          {!uploading && (
            <IconButton size="small" onClick={handleClearPreview}>
              <X size={16} />
            </IconButton>
          )}
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button
            size="small"
            color="inherit"
            onClick={handleClearPreview}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleUpload}
            disabled={uploading}
            startIcon={
              uploading ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />
            }
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box>
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      <Box
        {...getRootProps()}
        sx={{
          border: 2,
          borderStyle: 'dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          borderRadius: 1,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: isDragActive ? 'primary.50' : 'grey.50',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.light',
            bgcolor: 'grey.100',
          },
        }}
      >
        <input {...getInputProps()} />

        <Upload
          size={32}
          className={isDragActive ? 'text-blue-500 mb-2' : 'text-gray-400 mb-2'}
          style={{ margin: '0 auto 8px auto', display: 'block' }}
        />

        {isDragActive ? (
          <Typography variant="body2" color="primary.main" fontWeight={500}>
            Drop the file here
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              Drag and drop a file here, or click to browse
            </Typography>
            {accept && (
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
                Accepted: {accept}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

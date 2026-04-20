/**
 * FlyerScanUpload — Camera/upload UI for flyer scanning.
 * Supports multiple files and document formats (images, PDFs, DOCX).
 * Mobile: opens camera directly. Desktop: file picker with drag-and-drop.
 */

import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Upload, AlertCircle, RotateCcw, FileText } from 'lucide-react';
import { isAcceptedFile, MAX_FILE_SIZE_BYTES } from '@/lib/fileExtractors';
import { useToast } from '@/hooks/use-toast';
import type { ScanState } from '@/hooks/useFlyerScan';
import { MAX_UPLOAD_MB, type UploadError } from '@/lib/uploadErrors';

const ACCEPTED_TYPES =
  'image/*,.pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

interface FlyerScanUploadProps {
  scanState: ScanState;
  error: UploadError | null;
  currentFileIndex: number;
  totalFiles: number;
  onFilesSelected: (files: File[]) => void;
  onReset: () => void;
  children?: React.ReactNode;
}

export function FlyerScanUpload({
  scanState,
  error,
  currentFileIndex,
  totalFiles,
  onFilesSelected,
  onReset,
  children,
}: FlyerScanUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setDragOver] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const accepted: File[] = [];
      const unsupported: string[] = [];
      const oversized: string[] = [];

      for (const f of Array.from(fileList)) {
        if (!isAcceptedFile(f)) {
          unsupported.push(f.name);
          continue;
        }
        if (f.size > MAX_FILE_SIZE_BYTES) {
          oversized.push(f.name);
          continue;
        }
        accepted.push(f);
      }

      const parts: string[] = [];
      if (unsupported.length > 0) {
        parts.push(
          t('submission.errors.unsupportedTypeNamed', { names: unsupported.join(', ') }),
        );
      }
      if (oversized.length > 0) {
        parts.push(
          t('submission.errors.fileTooLargeNamed', {
            names: oversized.join(', '),
            maxMb: MAX_UPLOAD_MB,
          }),
        );
      }
      const message = parts.length > 0 ? parts.join(' ') : null;
      setRejectionMessage(message);
      if (message) {
        toast({
          title: t('submission.errors.title'),
          description: message,
          variant: 'destructive',
        });
      }
      if (accepted.length > 0) onFilesSelected(accepted);
    },
    [onFilesSelected, toast, t],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  if (scanState === 'results' && children) {
    return <>{children}</>;
  }

  if (scanState === 'error') {
    const errorCopy = error
      ? t(error.i18nKey, error.i18nValues as Record<string, unknown> | undefined)
      : t('submission.errors.uploadFailed');
    const showRetry = error ? error.retryable : true;

    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <AlertCircle
              style={{ width: 20, height: 20, color: '#ef4444', flexShrink: 0, marginTop: 2 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {t('submission.errors.title')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                {errorCopy}
              </Typography>
            </Box>
            {showRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RotateCcw style={{ width: 14, height: 14 }} />
                {t('submission.errors.retry')}
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (scanState === 'uploading' || scanState === 'analyzing') {
    const progressText =
      totalFiles > 1
        ? `Processing file ${currentFileIndex + 1} of ${totalFiles}...`
        : scanState === 'uploading'
          ? 'Uploading...'
          : 'Analyzing...';

    return (
      <Card>
        <CardContent>
          <Box
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1 }}
          >
            <CircularProgress size={32} sx={{ color: '#ec4899' }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {progressText}
            </Typography>
            {totalFiles > 1 && (
              <LinearProgress
                variant="determinate"
                value={
                  ((currentFileIndex + (scanState === 'analyzing' ? 0.5 : 0)) / totalFiles) * 100
                }
                sx={{
                  width: '100%',
                  borderRadius: 2,
                  '& .MuiLinearProgress-bar': { bgcolor: '#ec4899' },
                }}
              />
            )}
            {scanState === 'analyzing' && (
              <Typography variant="caption" color="text.secondary">
                This usually takes 5-10 seconds per file
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple={!isMobile}
          capture={isMobile ? 'environment' : undefined}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: '#ec489915',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isMobile ? (
              <Camera style={{ width: 20, height: 20, color: '#ec4899' }} />
            ) : (
              <Upload style={{ width: 20, height: 20, color: '#ec4899' }} />
            )}
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {isMobile ? 'Scan a flyer' : 'Upload flyers or documents'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isMobile
                ? 'Take a photo or choose files to auto-fill the form'
                : 'Drag & drop or click to upload images, PDFs, or documents'}
            </Typography>
          </Box>
          {!isMobile && (
            <FileText
              style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0, marginLeft: 'auto' }}
            />
          )}
        </Box>
        {rejectionMessage && (
          <Box
            role="alert"
            aria-live="polite"
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1.5 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle
              style={{ width: 16, height: 16, color: '#ef4444', flexShrink: 0, marginTop: 2 }}
            />
            <Typography variant="caption" sx={{ color: '#ef4444' }}>
              {rejectionMessage}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

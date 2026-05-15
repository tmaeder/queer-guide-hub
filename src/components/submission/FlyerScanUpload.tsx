/**
 * FlyerScanUpload — Camera/upload UI for flyer scanning.
 * Supports multiple files and document formats (images, PDFs, DOCX).
 * Mobile: opens camera directly. Desktop: file picker with drag-and-drop.
 */

import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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
          <div className="flex items-start gap-3">
            <AlertCircle
              style={{ width: 20, height: 20, color: '#ef4444', flexShrink: 0, marginTop: 2 }}
            />
            <div className="flex-1">
              <p className="text-sm font-semibold mb-1">
                {t('submission.errors.title')}
              </p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {errorCopy}
              </p>
            </div>
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
          </div>
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
    const pct = ((currentFileIndex + (scanState === 'analyzing' ? 0.5 : 0)) / totalFiles) * 100;

    return (
      <Card>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="animate-spin h-8 w-8" style={{ color: '#ec4899' }} aria-label="Loading" />
            <p className="text-sm font-medium">{progressText}</p>
            {totalFiles > 1 && (
              <div className="w-full h-1 bg-muted rounded overflow-hidden">
                <div
                  className="h-full transition-[width]"
                  style={{ width: `${pct}%`, backgroundColor: '#ec4899' }}
                />
              </div>
            )}
            {scanState === 'analyzing' && (
              <p className="text-xs text-muted-foreground">
                This usually takes 5-10 seconds per file
              </p>
            )}
          </div>
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
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-element flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#ec489915' }}
          >
            {isMobile ? (
              <Camera style={{ width: 20, height: 20, color: '#ec4899' }} />
            ) : (
              <Upload style={{ width: 20, height: 20, color: '#ec4899' }} />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {isMobile ? 'Scan a flyer' : 'Upload flyers or documents'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isMobile
                ? 'Take a photo or choose files to auto-fill the form'
                : 'Drag & drop or click to upload images, PDFs, or documents'}
            </p>
          </div>
          {!isMobile && (
            <FileText
              style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0, marginLeft: 'auto' }}
            />
          )}
        </div>
        {rejectionMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 mt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertCircle
              style={{ width: 16, height: 16, color: '#ef4444', flexShrink: 0, marginTop: 2 }}
            />
            <p className="text-xs" style={{ color: '#ef4444' }}>
              {rejectionMessage}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

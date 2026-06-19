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
import { Input } from '@/components/ui/input';
import { Camera, Upload, AlertCircle, RotateCcw, FileText, Link2 } from 'lucide-react';
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
  /** When provided, a link-paste field is shown above the dropzone. */
  onUrlSubmit?: (url: string) => void;
  onReset: () => void;
  children?: React.ReactNode;
}

export function FlyerScanUpload({
  scanState,
  error,
  currentFileIndex,
  totalFiles,
  onFilesSelected,
  onUrlSubmit,
  onReset,
  children,
}: FlyerScanUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setDragOver] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const { toast } = useToast();

  const submitUrl = useCallback(() => {
    const v = urlValue.trim();
    if (v && onUrlSubmit) onUrlSubmit(v);
  }, [urlValue, onUrlSubmit]);

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
        parts.push(t('submission.errors.unsupportedTypeNamed', { names: unsupported.join(', ') }));
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
          <div className="flex items-start gap-4">
            <AlertCircle size={20} className="shrink-0 mt-0.5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-semibold mb-1">{t('submission.errors.title')}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{errorCopy}</p>
            </div>
            {showRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                style={{ alignItems: 'center' }}
                className="flex gap-1"
              >
                <RotateCcw size={14} />
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
          <div className="flex flex-col items-center gap-4 py-2">
            <Loader2 className="animate-spin h-8 w-8 text-foreground" aria-label="Loading" />
            <p className="text-sm font-medium">{progressText}</p>
            {totalFiles > 1 && (
              <div className="w-full h-1 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-foreground transition-[width]"
                  style={{ width: `${pct}%` }}
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
    <div className="flex flex-col gap-4">
      {onUrlSubmit && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                type="url"
                inputMode="url"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitUrl();
                  }
                }}
                placeholder="Paste a link — event page, Instagram, venue site, news…"
                aria-label="Paste a link to scan"
                className="pl-10"
              />
            </div>
            <Button type="button" onClick={submitUrl} disabled={!urlValue.trim()}>
              Scan link
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="group/drop w-full rounded-container border-2 border-dashed border-border bg-card px-6 py-10 text-center transition-colors duration-200 hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple={!isMobile}
          capture={isMobile ? 'environment' : undefined}
          onChange={handleInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-element bg-muted text-foreground transition-colors group-hover/drop:bg-foreground group-hover/drop:text-background">
            {isMobile ? (
              <Camera size={22} aria-hidden="true" />
            ) : (
              <Upload size={22} aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {isMobile ? 'Scan a flyer' : 'Upload flyers or documents'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isMobile
                ? 'Take a photo or choose files to auto-fill the form'
                : 'Drag & drop or click to upload images, PDFs, or documents'}
            </p>
          </div>
          {!isMobile && (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <FileText size={13} aria-hidden="true" className="shrink-0" />
              JPG, PNG, PDF, DOCX or TXT
            </p>
          )}
        </div>
        {rejectionMessage && (
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- role=alert wrapper needs propagation guards to prevent parent button activation
          <div
            role="alert"
            aria-live="polite"
            className="mt-4 flex items-start justify-center gap-2 text-left"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">{rejectionMessage}</p>
          </div>
        )}
      </button>
    </div>
  );
}

/**
 * FlyerScanUpload — Camera/upload UI for flyer scanning.
 * Mobile: opens camera directly. Desktop: file picker with drag-and-drop.
 */

import { useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Upload, AlertCircle, RotateCcw } from 'lucide-react';
import type { ScanState } from '@/hooks/useFlyerScan';

interface FlyerScanUploadProps {
  scanState: ScanState;
  error: string | null;
  onFileSelected: (file: File) => void;
  onReset: () => void;
  children?: React.ReactNode; // FlyerScanResults rendered here when state === 'results'
}

export function FlyerScanUpload({
  scanState,
  error,
  onFileSelected,
  onReset,
  children,
}: FlyerScanUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 20 * 1024 * 1024) return;
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Results state — render children (FlyerScanResults)
  if (scanState === 'results' && children) {
    return <>{children}</>;
  }

  // Error state
  if (scanState === 'error') {
    return (
      <Card sx={{ mb: 2, borderColor: 'error.main', borderWidth: 1 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <AlertCircle
              style={{ width: 20, height: 20, color: '#ef4444', flexShrink: 0, marginTop: 2 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Scan failed
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {error || 'Something went wrong. Please try again.'}
              </Typography>
            </Box>
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw style={{ width: 14, height: 14 }} />
              Retry
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Uploading / Analyzing state
  if (scanState === 'uploading' || scanState === 'analyzing') {
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Box
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1 }}
          >
            <CircularProgress size={32} sx={{ color: '#ec4899' }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {scanState === 'uploading' ? 'Uploading image...' : 'Analyzing flyer...'}
            </Typography>
            {scanState === 'analyzing' && (
              <Typography variant="caption" color="text.secondary">
                This usually takes 5-10 seconds
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Idle state — upload zone
  return (
    <Card
      sx={{
        mb: 2,
        border: 2,
        borderStyle: 'dashed',
        borderColor: dragOver ? '#ec4899' : 'divider',
        transition: 'border-color 0.2s',
        cursor: 'pointer',
        '&:hover': { borderColor: '#ec489966' },
      }}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent sx={{ p: 2.5 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
              {isMobile ? 'Scan a flyer' : 'Upload a flyer'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isMobile
                ? 'Take a photo or choose from gallery to auto-fill the form'
                : 'Drag & drop or click to upload an image to auto-fill the form'}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

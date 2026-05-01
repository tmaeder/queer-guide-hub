import { Badge } from '@/components/ui/badge';
import { Image as ImageIcon, File, Video, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { MediaItem } from './types';

export const getFileType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image/jpeg';
  if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video/mp4';
  return 'application/octet-stream';
};

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <ImageIcon style={{ height: 16, width: 16 }} />;
  if (mimeType.startsWith('video/')) return <Video style={{ height: 16, width: 16 }} />;
  if (mimeType.includes('pdf') || mimeType.includes('text')) return <FileText style={{ height: 16, width: 16 }} />;
  return <File style={{ height: 16, width: 16 }} />;
};

export const getOptimizationStatusBadge = (status: MediaItem['optimization_status']) => {
  switch (status) {
    case 'optimized':
      return <Badge variant="default" style={{ fontSize: '0.75rem', backgroundColor: '#dcfce7', color: '#166534' }}>Optimized</Badge>;
    case 'processing':
      return <Badge variant="default" style={{ fontSize: '0.75rem', backgroundColor: '#dbeafe', color: '#1e40af' }}>Processing</Badge>;
    case 'pending':
      return <Badge variant="default" style={{ fontSize: '0.75rem', backgroundColor: '#fef9c3', color: '#854d0e' }}>Pending</Badge>;
    case 'failed':
      return <Badge variant="destructive" style={{ fontSize: '0.75rem' }}>Failed</Badge>;
    case 'not_optimized':
    default:
      return <Badge variant="outline" style={{ fontSize: '0.75rem' }}>Not Optimized</Badge>;
  }
};

export const getImageUrl = (item: MediaItem) => {
  const bucket = (item as unknown as Record<string, unknown>).bucket as string || 'cms-media';
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(item.storage_path);
  return data.publicUrl;
};

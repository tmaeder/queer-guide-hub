import { Badge } from '@/components/ui/badge';
import { Image as ImageIcon, File, Video, FileText, Zap, Clock, AlertTriangle, CheckCircle, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { UnifiedMediaItem, OptimizationStatus } from './types';

export const getFileType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext || '')) return 'image/jpeg';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) return 'video/mp4';
  return 'application/octet-stream';
};

export const formatFileSize = (bytes: number | null | undefined) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const getFileIcon = (mimeType: string, size = 16) => {
  const s = { height: size, width: size };
  if (mimeType.startsWith('image/')) return <ImageIcon style={s} />;
  if (mimeType.startsWith('video/')) return <Video style={s} />;
  if (mimeType.includes('pdf') || mimeType.includes('text')) return <FileText style={s} />;
  return <File style={s} />;
};

export const getOptimizationStatusBadge = (status: OptimizationStatus | undefined) => {
  const s = { fontSize: '0.625rem' as const };
  switch (status) {
    case 'optimized':
      return (
        <Badge variant="outline" style={s}>
          <CheckCircle style={{ height: 10, width: 10, marginRight: 3 }} />
          Optimized
        </Badge>
      );
    case 'cdn_optimized':
      return (
        <Badge variant="outline" style={s}>
          <Globe style={{ height: 10, width: 10, marginRight: 3 }} />
          CDN
        </Badge>
      );
    case 'processing':
      return (
        <Badge variant="default" style={s}>
          <Clock style={{ height: 10, width: 10, marginRight: 3 }} />
          Processing
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary" style={s}>
          <Clock style={{ height: 10, width: 10, marginRight: 3 }} />
          Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" style={s}>
          <AlertTriangle style={{ height: 10, width: 10, marginRight: 3 }} />
          Failed
        </Badge>
      );
    case 'skipped':
      return <Badge variant="outline" style={s}>Skipped</Badge>;
    case 'not_optimized':
    default:
      return <Badge variant="outline" style={s}>Unoptimized</Badge>;
  }
};

export const getOptimizationIcon = (status: OptimizationStatus | undefined) => {
  const s = { height: 14, width: 14 };
  switch (status) {
    case 'optimized':
    case 'cdn_optimized':
      return <Zap style={s} />;
    case 'failed':
      return <AlertTriangle style={s} />;
    default:
      return null;
  }
};

export const getImageUrl = (item: UnifiedMediaItem) => {
  if (item.url) return item.url;
  if (item.storage_path) {
    const bucket = item.bucket_name || 'cms-media';
    const { data } = supabase.storage.from(bucket).getPublicUrl(item.storage_path);
    return data.publicUrl;
  }
  return '';
};

export const getThumbnailUrl = (item: UnifiedMediaItem) => {
  if (item.thumbnail_url) return item.thumbnail_url;
  return getImageUrl(item);
};

export const entityTypeLabel = (et: string) =>
  et.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const entityAdminPath = (entityType: string, entityId: string) => {
  const map: Record<string, string> = {
    venue: '/admin/venues',
    event: '/admin/events',
    news_article: '/admin/news',
    personality: '/admin/personalities',
    marketplace_listing: '/admin/marketplace',
    city: '/admin/cities',
    country: '/admin/countries',
    queer_village: '/admin/villages',
  };
  const base = map[entityType];
  if (!base) return `/admin/${entityType}/${entityId}`;
  return `${base}/${entityId}`;
};

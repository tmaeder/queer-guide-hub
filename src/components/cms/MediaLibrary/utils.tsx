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
  if (!bytes || bytes === 0) return '—';
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
          <CheckCircle size={10} style={{ marginRight: 3 }} />
          Optimized
        </Badge>
      );
    case 'cdn_optimized':
      return (
        <Badge variant="outline" style={s}>
          <Globe size={10} style={{ marginRight: 3 }} />
          CDN
        </Badge>
      );
    case 'processing':
      return (
        <Badge variant="default" style={s}>
          <Clock size={10} style={{ marginRight: 3 }} />
          Processing
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary" style={s}>
          <Clock size={10} style={{ marginRight: 3 }} />
          Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" style={s}>
          <AlertTriangle size={10} style={{ marginRight: 3 }} />
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
  const url = getImageUrl(item);
  // Fix data URIs with non-standard "utf8" encoding — decode to proper format
  if (url.startsWith('data:image/svg+xml;utf8,')) {
    const svg = decodeURIComponent(url.slice('data:image/svg+xml;utf8,'.length));
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return url;
};

export const entityTypeLabel = (et: string) =>
  et.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const entityAdminPath = (entityType: string, entityId: string) => {
  // Entity management lives in the unified content browser (/admin/content/:type);
  // the editor is modal-launched there, so we link to the per-type list route.
  const contentSlug: Record<string, string> = {
    venue: 'venues',
    event: 'events',
    news_article: 'news_articles',
    personality: 'personalities',
    marketplace_listing: 'marketplace_listings',
    city: 'cities',
    country: 'countries',
    queer_village: 'queer_villages',
  };
  const slug = contentSlug[entityType];
  if (!slug) return `/admin/${entityType}/${entityId}`;
  return `/admin/content/${slug}`;
};

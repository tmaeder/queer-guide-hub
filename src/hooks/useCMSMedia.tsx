/**
 * useCMSMedia - Media management hook
 * Handles CRUD for cms_media and cms_media_attachments.
 */

import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import type { CMSMedia, CMSMediaAttachment, MediaRole } from '@/types/cms';

interface MediaFilters {
  search?: string;
  mimeType?: string;
  bucket?: string;
  page?: number;
  pageSize?: number;
}

export interface ExternalImageImport {
  id: string;
  url: string;
  alt: string;
  photographer: string;
  photographer_url: string;
  source: string;
  license?: string;
  width?: number;
  height?: number;
}

interface UseCMSMediaReturn {
  media: CMSMedia[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  /** Fetch media items with optional filters */
  fetchMedia: (filters?: MediaFilters) => Promise<void>;
  /** Upload a file to Supabase storage and create cms_media record */
  uploadMedia: (file: File, bucket?: string, metadata?: Partial<CMSMedia>) => Promise<CMSMedia | null>;
  /** Delete a media item */
  deleteMedia: (mediaId: string) => Promise<boolean>;
  /** Attach media to a content item */
  attachMedia: (mediaId: string, sourceTable: string, sourceId: string, role?: MediaRole) => Promise<boolean>;
  /** Detach media from a content item */
  detachMedia: (attachmentId: string) => Promise<boolean>;
  /** Get all attachments for a content item */
  getAttachments: (sourceTable: string, sourceId: string) => Promise<CMSMediaAttachment[]>;
  /** Update media metadata (alt text, caption) */
  updateMediaMeta: (mediaId: string, updates: Partial<CMSMedia>) => Promise<boolean>;
  /** Import an external image (Pexels/Unsplash/Wikipedia) as a cms_media record */
  importExternalMedia: (image: ExternalImageImport) => Promise<CMSMedia | null>;
}

export function useCMSMedia(): UseCMSMediaReturn {
  const { user } = useAuth();
  const [media, setMedia] = useState<CMSMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const fetchMedia = useCallback(async (filters?: MediaFilters) => {
    setLoading(true);
    setError(null);

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
      let query = api
        .from('cms_media' as any)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filters?.search) {
        query = query.or(`filename.ilike.%${filters.search}%,original_filename.ilike.%${filters.search}%`);
      }

      if (filters?.mimeType) {
        query = query.ilike('mime_type', `${filters.mimeType}%`);
      }

      const { data, error: fetchError, count } = await query;
      if (fetchError) throw fetchError;

      setMedia((data || []) as CMSMedia[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('Error fetching media:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadMedia = useCallback(async (
    file: File,
    bucket: string = 'cms-media',
    metadata?: Partial<CMSMedia>,
  ): Promise<CMSMedia | null> => {
    if (!user) return null;

    try {
      // Generate unique filename
      const ext = file.name.split('.').pop() || 'bin';
      const timestamp = Date.now();
      const filename = `${timestamp}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `uploads/${filename}`;

      // Upload to Supabase storage
      const { error: uploadError } = await api.storage
        .from(bucket)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get image dimensions if it's an image
      let width: number | undefined;
      let height: number | undefined;
      if (file.type.startsWith('image/')) {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
      }

      // Create cms_media record
      const { data, error: insertError } = await api
        .from('cms_media' as any)
        .insert({
          filename,
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          width,
          height,
          storage_path: storagePath,
          uploaded_by: user.id,
          alt_text: metadata?.alt_text || {},
          caption: metadata?.caption || {},
          attribution: metadata?.attribution,
          license: metadata?.license,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return data as CMSMedia;
    } catch (err) {
      console.error('Error uploading media:', err);
      setError((err as Error).message);
      return null;
    }
  }, [user]);

  const deleteMedia = useCallback(async (mediaId: string): Promise<boolean> => {
    try {
      // Get storage path first
      const { data: mediaItem } = await api
        .from('cms_media' as any)
        .select('storage_path')
        .eq('id', mediaId)
        .single();

      if (mediaItem?.storage_path) {
        // Delete from storage
        await api.storage
          .from('cms-media')
          .remove([mediaItem.storage_path]);
      }

      // Delete record (attachments cascade)
      const { error: deleteError } = await api
        .from('cms_media' as any)
        .delete()
        .eq('id', mediaId);

      if (deleteError) throw deleteError;

      setMedia(prev => prev.filter(m => m.id !== mediaId));
      return true;
    } catch (err) {
      console.error('Error deleting media:', err);
      setError((err as Error).message);
      return false;
    }
  }, []);

  const attachMedia = useCallback(async (
    mediaId: string,
    sourceTable: string,
    sourceId: string,
    role: MediaRole = 'gallery',
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: insertError } = await api
        .from('cms_media_attachments' as any)
        .insert({
          media_id: mediaId,
          source_table: sourceTable,
          source_id: sourceId,
          media_role: role,
          created_by: user.id,
        });

      if (insertError) throw insertError;
      return true;
    } catch (err) {
      console.error('Error attaching media:', err);
      return false;
    }
  }, [user]);

  const detachMedia = useCallback(async (attachmentId: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await api
        .from('cms_media_attachments' as any)
        .delete()
        .eq('id', attachmentId);

      if (deleteError) throw deleteError;
      return true;
    } catch (err) {
      console.error('Error detaching media:', err);
      return false;
    }
  }, []);

  const getAttachments = useCallback(async (
    sourceTable: string,
    sourceId: string,
  ): Promise<CMSMediaAttachment[]> => {
    try {
      const { data, error: fetchError } = await api
        .from('cms_media_attachments' as any)
        .select('*, media:cms_media(*)')
        .eq('source_table', sourceTable)
        .eq('source_id', sourceId)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;
      return (data || []) as CMSMediaAttachment[];
    } catch (err) {
      console.error('Error fetching attachments:', err);
      return [];
    }
  }, []);

  const updateMediaMeta = useCallback(async (
    mediaId: string,
    updates: Partial<CMSMedia>,
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await api
        .from('cms_media' as any)
        .update({
          alt_text: updates.alt_text,
          caption: updates.caption,
          attribution: updates.attribution,
          license: updates.license,
        })
        .eq('id', mediaId);

      if (updateError) throw updateError;

      setMedia(prev => prev.map(m =>
        m.id === mediaId ? { ...m, ...updates } : m
      ));
      return true;
    } catch (err) {
      console.error('Error updating media meta:', err);
      return false;
    }
  }, []);

  const importExternalMedia = useCallback(async (
    image: ExternalImageImport,
  ): Promise<CMSMedia | null> => {
    if (!user) return null;

    try {
      const { data, error: insertError } = await api
        .from('cms_media' as any)
        .insert({
          filename: `${image.source}-${image.id}`,
          original_filename: image.alt || `${image.source}-image`,
          mime_type: 'image/jpeg',
          file_size: 0,
          width: image.width,
          height: image.height,
          storage_path: image.url,
          uploaded_by: user.id,
          alt_text: { en: image.alt || '' },
          attribution: `Photo by ${image.photographer}`,
          license: image.license || `${image.source} License`,
          source_url: image.photographer_url,
          external_source: image.source,
          external_id: image.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return data as CMSMedia;
    } catch (err) {
      console.error('Error importing external media:', err);
      setError((err as Error).message);
      return null;
    }
  }, [user]);

  return {
    media,
    loading,
    error,
    totalCount,
    fetchMedia,
    uploadMedia,
    deleteMedia,
    attachMedia,
    detachMedia,
    getAttachments,
    updateMediaMeta,
    importExternalMedia,
  };
}

// Helper: Get image dimensions from a File
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

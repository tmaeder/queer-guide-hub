import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { MediaItem } from '@/components/cms/MediaLibrary/types';
import { getFileType } from '@/components/cms/MediaLibrary/utils';

export function useMediaList(enabled: boolean) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMedia = useCallback(async () => {
    try {
      setLoading(true);

      const { data: cmsMediaData, error: cmsError } = await supabase
        .from('cms_media')
        .select(`
          *,
          cms_content_media(
            content_id,
            cms_content(title)
          )
        `)
        .order('created_at', { ascending: false });

      if (cmsError) {
        console.error('CMS media error:', cmsError);
      }

      const { data: optimizationData, error: optimizationError } = await supabase
        .from('media_optimization_status')
        .select('*');

      if (optimizationError) {
        console.error('Error fetching optimization status:', optimizationError);
      }

      const optimizationLookup: Record<string, Record<string, unknown>> = {};
      if (optimizationData) {
        optimizationData.forEach(opt => {
          const key = `${opt.bucket_name}/${opt.file_path}`;
          optimizationLookup[key] = opt;
        });
      }

      const processCmsMedia = (cmsMediaData || []).map(item => ({
        ...item,
        usage_count: item.cms_content_media?.length || 0,
        content_items: item.cms_content_media?.map((rel: { cms_content?: { title?: string } }) =>
          rel.cms_content?.title || 'Untitled'
        ).filter(Boolean) || [],
        source: 'cms',
        optimization_status: 'not_optimized',
        formats_available: ['Original'],
        optimization_metadata: {
          original_size: item.file_size,
          formats: [{
            format: item.mime_type.split('/')[1]?.toUpperCase() || 'UNKNOWN',
            size: item.file_size,
            width: item.width,
            height: item.height
          }]
        }
      }));

      const buckets = ['adult-model-images', 'city-images', 'tag-images'];
      let allStorageFiles: Record<string, unknown>[] = [];

      for (const bucket of buckets) {
        try {
          const { data: files, error } = await supabase.storage
            .from(bucket)
            .list('', {
              limit: 1000,
              sortBy: { column: 'created_at', order: 'desc' }
            });

          if (error) {
            console.error(`Error fetching from ${bucket}:`, error);
            continue;
          }

          if (files && files.length > 0) {
            const processedFiles = files
              .filter(file => file.name && !file.name.includes('.emptyFolderPlaceholder'))
              .map(file => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const optimizationKey = `${bucket}/${file.name}`;
                const optimizationInfo = optimizationLookup[optimizationKey];

                let optimizationStatus = 'not_optimized';
                let formatsAvailable = [ext.toUpperCase()];
                let optimizationMetadata = {
                  original_size: file.metadata?.size || 0,
                  compressed_size: undefined as number | undefined,
                  compression_ratio: undefined as number | undefined,
                  formats: [{
                    format: ext.toUpperCase(),
                    size: file.metadata?.size || 0,
                    width: file.metadata?.width,
                    height: file.metadata?.height
                  }]
                };

                if (optimizationInfo) {
                  optimizationStatus = optimizationInfo.optimization_status;
                  if (optimizationInfo.optimized_formats && Array.isArray(optimizationInfo.optimized_formats)) {
                    const formats = optimizationInfo.optimized_formats;
                    formatsAvailable = [ext.toUpperCase(), ...formats.map((f: { format?: string }) => f.format?.toUpperCase())].filter(Boolean);

                    optimizationMetadata = {
                      ...optimizationMetadata,
                      compressed_size: optimizationInfo.compression_data?.total_compressed_size,
                      compression_ratio: optimizationInfo.compression_data?.compression_ratio,
                      formats: [
                        {
                          format: ext.toUpperCase(),
                          size: optimizationInfo.original_size,
                          width: file.metadata?.width,
                          height: file.metadata?.height
                        },
                        ...formats
                      ]
                    };
                  }
                } else {
                  const hasOptimizedFormats = ['webp', 'avif'].includes(ext);
                  if (hasOptimizedFormats) {
                    optimizationStatus = 'optimized';
                    optimizationMetadata.compressed_size = Math.floor((file.metadata?.size || 0) * 0.7);
                    optimizationMetadata.compression_ratio = 30;
                  }
                }

                return {
                  id: `${bucket}-${file.name}`,
                  filename: file.name,
                  original_filename: file.name,
                  mime_type: file.metadata?.mimetype || getFileType(file.name),
                  file_size: file.metadata?.size || 0,
                  width: file.metadata?.width,
                  height: file.metadata?.height,
                  storage_path: file.name,
                  uploaded_by: 'system',
                  created_at: file.created_at || file.updated_at || new Date().toISOString(),
                  alt_text: {},
                  caption: {},
                  usage_count: 0,
                  content_items: [],
                  source: bucket,
                  bucket: bucket,
                  optimization_status: optimizationStatus,
                  formats_available: formatsAvailable,
                  optimization_metadata: optimizationMetadata
                };
              });

            allStorageFiles = [...allStorageFiles, ...processedFiles];
          }
        } catch (storageError) {
          console.error(`Storage error for ${bucket}:`, storageError);
        }
      }

      const allMedia = [...processCmsMedia, ...allStorageFiles];
      setMedia(allMedia as MediaItem[]);
    } catch (error) {
      console.error('Error fetching media:', error);
      toast({
        title: "Error",
        description: "Failed to load media library",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (enabled) {
      fetchMedia();
    }
  }, [enabled, fetchMedia]);

  return { media, setMedia, loading, setLoading, fetchMedia };
}

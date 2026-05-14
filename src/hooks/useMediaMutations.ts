import { useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { UnifiedMediaItem } from '@/components/cms/MediaLibrary/types';

export function useMediaMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateMedia = () => {
    queryClient.invalidateQueries({ queryKey: ['unified-media'] });
    queryClient.invalidateQueries({ queryKey: ['media-detail'] });
  };

  const toggleStar = useMutation({
    mutationFn: async (item: UnifiedMediaItem) => {
      const table = item.source_type === 'image_asset' ? 'image_assets' : 'cms_media';
      const { error } = await untypedFrom(table)
        .update({ starred: !item.starred })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateMedia(),
    onError: () => toast({ title: 'Failed to update star', variant: 'destructive' }),
  });

  const deleteItem = useMutation({
    mutationFn: async (item: UnifiedMediaItem) => {
      if (item.source_type === 'cms_media') {
        if (item.storage_path) {
          await supabase.storage.from(item.bucket_name || 'cms-media').remove([item.storage_path]);
        }
        const { error } = await untypedFrom('cms_media').delete().eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await untypedFrom('image_assets')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Deleted' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  const bulkDelete = useMutation({
    mutationFn: async (items: UnifiedMediaItem[]) => {
      for (const item of items) {
        if (item.usage_count > 0) continue;
        if (item.source_type === 'cms_media') {
          if (item.storage_path) {
            await supabase.storage.from(item.bucket_name || 'cms-media').remove([item.storage_path]);
          }
          await untypedFrom('cms_media').delete().eq('id', item.id);
        } else {
          await untypedFrom('image_assets')
            .update({ status: 'deleted', updated_at: new Date().toISOString() })
            .eq('id', item.id);
        }
      }
    },
    onSuccess: (_data, items) => {
      invalidateMedia();
      toast({ title: `Deleted ${items.length} items` });
    },
    onError: () => toast({ title: 'Bulk delete failed', variant: 'destructive' }),
  });

  const updateMetadata = useMutation({
    mutationFn: async ({
      item,
      updates,
    }: {
      item: UnifiedMediaItem;
      updates: { alt_text?: string; attribution?: string; license?: string };
    }) => {
      if (item.source_type === 'image_asset') {
        const { error } = await untypedFrom('image_assets')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) throw error;
      } else {
        const patch: Record<string, unknown> = {};
        if (updates.alt_text !== undefined) {
          patch.alt_text = { ...(item.alt_text_i18n || {}), en: updates.alt_text };
        }
        if (updates.attribution !== undefined) patch.attribution = updates.attribution;
        if (updates.license !== undefined) patch.license = updates.license;
        const { error } = await untypedFrom('cms_media').update(patch).eq('id', item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Saved' });
    },
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  const removeEntityLink = useMutation({
    mutationFn: async ({ assetId, entityType, entityId, role }: {
      assetId: string;
      entityType: string;
      entityId: string;
      role: string;
    }) => {
      const { error } = await untypedFrom('image_asset_links')
        .delete()
        .eq('asset_id', assetId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('role', role);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Link removed' });
    },
    onError: () => toast({ title: 'Failed to remove link', variant: 'destructive' }),
  });

  const setAsCover = useMutation({
    mutationFn: async ({ assetId, entityType, entityId }: {
      assetId: string;
      entityType: string;
      entityId: string;
    }) => {
      await untypedFrom('image_asset_links')
        .update({ role: 'gallery' })
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('role', 'cover');

      const { error } = await untypedFrom('image_asset_links')
        .update({ role: 'cover' })
        .eq('asset_id', assetId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Set as cover' });
    },
    onError: () => toast({ title: 'Failed to set cover', variant: 'destructive' }),
  });

  const optimizeItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('optimize-images-batch', {
        body: { batch_size: 1 },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Optimization complete' });
    },
    onError: () => toast({ title: 'Optimization failed', variant: 'destructive' }),
  });

  return {
    toggleStar,
    deleteItem,
    bulkDelete,
    updateMetadata,
    removeEntityLink,
    setAsCover,
    optimizeItem,
  };
}

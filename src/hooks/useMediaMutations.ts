import { useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { UnifiedMediaItem, AccessLevel, BrandCategory, TemplateStatus } from '@/components/cms/MediaLibrary/types';

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

  // DAM governance: access tier + brand category live on the same column set for both
  // catalog tables, so one patch shape works for either source_type.
  const updateGovernance = useMutation({
    mutationFn: async ({
      item,
      updates,
    }: {
      item: UnifiedMediaItem;
      updates: { access_level?: AccessLevel; brand_category?: BrandCategory | null };
    }) => {
      // A cms_media access-tier change must relocate the bytes to the bucket/prefix that
      // enforces the new tier — client storage RLS can't do that (admins can't delete
      // root-level cms-media objects), so route it through the service-role edge function
      // which moves the object and patches the row atomically.
      if (
        item.source_type === 'cms_media' &&
        updates.access_level &&
        updates.access_level !== item.access_level
      ) {
        const body: Record<string, unknown> = { id: item.id, access_level: updates.access_level };
        if (updates.brand_category !== undefined) body.brand_category = updates.brand_category;
        const { error } = await supabase.functions.invoke('dam-relocate-asset', { body });
        if (error) throw error;
        return;
      }

      const table = item.source_type === 'image_asset' ? 'image_assets' : 'cms_media';
      const patch: Record<string, unknown> = { ...updates };
      if (item.source_type === 'image_asset') patch.updated_at = new Date().toISOString();
      const { error } = await untypedFrom(table).update(patch).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Saved' });
    },
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  // Tags reuse the polymorphic unified_tag_assignments table (entity_type = source_type).
  // Only existing vocabulary tags can be assigned — no ad-hoc tag creation from here.
  const addTag = useMutation({
    mutationFn: async ({ item, slug }: { item: UnifiedMediaItem; slug: string }) => {
      const clean = slug.trim().toLowerCase();
      if (!clean) return;
      const { data: tag, error: tagErr } = await untypedFrom('unified_tags')
        .select('id')
        .eq('slug', clean)
        .maybeSingle();
      if (tagErr) throw tagErr;
      if (!tag) throw new Error(`Unknown tag "${clean}"`);
      const tagId = (tag as { id: string }).id;

      const { data: existing } = await untypedFrom('unified_tag_assignments')
        .select('id')
        .eq('tag_id', tagId)
        .eq('entity_id', item.id)
        .eq('entity_type', item.source_type)
        .maybeSingle();
      if (existing) return;

      const { error } = await untypedFrom('unified_tag_assignments')
        .insert({ tag_id: tagId, entity_id: item.id, entity_type: item.source_type });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Tag added' });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : 'Failed to add tag', variant: 'destructive' }),
  });

  const removeTag = useMutation({
    mutationFn: async ({ item, slug }: { item: UnifiedMediaItem; slug: string }) => {
      const { data: tag } = await untypedFrom('unified_tags')
        .select('id')
        .eq('slug', slug.toLowerCase())
        .maybeSingle();
      if (!tag) return;
      const { error } = await untypedFrom('unified_tag_assignments')
        .delete()
        .eq('tag_id', (tag as { id: string }).id)
        .eq('entity_id', item.id)
        .eq('entity_type', item.source_type);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Tag removed' });
    },
    onError: () => toast({ title: 'Failed to remove tag', variant: 'destructive' }),
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

  // Template governance: approve/deprecate a template asset via the audited RPC
  // (set_template_status writes to dam_template_audit). Pass null to clear.
  const setTemplateStatus = useMutation({
    mutationFn: async ({ item, status }: { item: UnifiedMediaItem; status: TemplateStatus | null }) => {
      const { error } = await untypedSupabase.rpc('set_template_status', {
        p_source: item.source_type,
        p_id: item.id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMedia();
      toast({ title: 'Template status updated' });
    },
    onError: () => toast({ title: 'Failed to update template status', variant: 'destructive' }),
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
    updateGovernance,
    addTag,
    removeTag,
    removeEntityLink,
    setAsCover,
    setTemplateStatus,
    optimizeItem,
  };
}

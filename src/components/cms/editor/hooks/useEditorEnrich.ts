/**
 * useEditorEnrich — cms-ai summarize + seo_draft orchestration for the editor.
 * Fills empty description/excerpt/meta fields only; never overwrites content.
 */

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ContentTypeConfig, EditorState } from '@/types/cms';

export function useEditorEnrich(
  contentType: string,
  config: ContentTypeConfig | undefined,
  state: EditorState,
  setFields: (fields: Record<string, unknown>) => void,
) {
  const [isEnriching, setIsEnriching] = useState(false);

  const handleEnrich = useCallback(async () => {
    if (!state.itemId || !config) return;
    setIsEnriching(true);
    try {
      const baseArgs = {
        content_type: contentType,
        record_id: state.itemId,
        source: state.data as Record<string, unknown>,
      };
      const [summaryRes, seoRes] = await Promise.all([
        supabase.functions.invoke('cms-ai', { body: { op: 'summarize', ...baseArgs } }),
        supabase.functions.invoke('cms-ai', { body: { op: 'seo_draft', ...baseArgs } }),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      if (seoRes.error) throw seoRes.error;

      const updates: Record<string, unknown> = {};
      const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
      const summary = summaryRes.data?.output as string | undefined;
      const seo = seoRes.data?.output as
        | { meta_title?: string; meta_description?: string }
        | undefined;

      const descField = config.fields.find(
        (f) => f.name === 'description' && !f.readOnly && !f.hidden,
      );
      const excerptField = config.fields.find(
        (f) => f.name === 'excerpt' && !f.readOnly && !f.hidden,
      );
      if (summary && descField && isEmpty(state.data.description)) updates.description = summary;
      else if (summary && excerptField && isEmpty(state.data.excerpt)) updates.excerpt = summary;

      const metaTitleField = config.fields.find(
        (f) => f.name === 'meta_title' && !f.readOnly && !f.hidden,
      );
      const metaDescField = config.fields.find(
        (f) => f.name === 'meta_description' && !f.readOnly && !f.hidden,
      );
      if (seo?.meta_title && metaTitleField && isEmpty(state.data.meta_title))
        updates.meta_title = seo.meta_title;
      if (seo?.meta_description && metaDescField && isEmpty(state.data.meta_description))
        updates.meta_description = seo.meta_description;

      const count = Object.keys(updates).length;
      if (count > 0) {
        setFields(updates);
        toast.success(`AI filled ${count} field${count > 1 ? 's' : ''}`);
      } else {
        toast.info('Content already looks good — no changes suggested');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Enrichment failed: ${msg}`);
    } finally {
      setIsEnriching(false);
    }
  }, [state.itemId, contentType, config, state.data, setFields]);

  return { isEnriching, handleEnrich };
}

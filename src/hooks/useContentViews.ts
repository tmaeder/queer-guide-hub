import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';
import type { ViewSpec } from '@/components/cms/ContentListPanel/viewSpec';

/**
 * Saved, named views for one admin content type.
 *
 * Queries go through `untypedFrom` because `admin_content_views` is created by
 * migration 20260807150000 and is not in the generated `types.ts` until that
 * applies and the types are regenerated. This is the documented escape hatch
 * (CLAUDE.md) — the row shape is asserted by the local `Row` interface below.
 *
 * Lives in `src/hooks/` because the `queerguide/no-supabase-from-in-pages` rule
 * forbids `supabase.from()` in components.
 *
 * RLS scopes every row to the signed-in user, so no query here filters by
 * user_id — doing it in the client too would imply the policy is optional.
 */

export interface SavedView {
  id: string;
  contentType: string;
  name: string;
  spec: ViewSpec;
  isDefault: boolean;
  position: number;
}

interface PgError {
  code?: string;
  message: string;
}

interface Result {
  data: unknown;
  error: PgError | null;
}

/**
 * `untypedFrom` casts the CLIENT, but the returned builder still types its
 * column arguments against the generated table union — and this table is not
 * in it until migration 20260807150000 applies and types are regenerated. This
 * is the narrow surface actually used, so the escape hatch stays visible
 * instead of spreading `as never` across every call.
 */
interface LooseTable {
  select: (cols: string) => LooseTable;
  insert: (values: Record<string, unknown>) => LooseTable;
  update: (values: Record<string, unknown>) => LooseTable;
  delete: () => LooseTable;
  eq: (col: string, value: unknown) => LooseTable;
  order: (col: string) => LooseTable;
  single: () => Promise<Result>;
  then: <R>(onfulfilled: (value: Result) => R) => Promise<R>;
}

const viewsTable = () => untypedFrom('admin_content_views') as unknown as LooseTable;

interface Row {
  id: string;
  content_type: string;
  name: string;
  spec: unknown;
  is_default: boolean;
  position: number;
}

function toView(row: Row): SavedView {
  return {
    id: row.id,
    contentType: row.content_type,
    name: row.name,
    // Not normalized here: normalizeSpec needs the type config, which the
    // consumer has. Treat this as raw jsonb until then.
    spec: row.spec as ViewSpec,
    isDefault: row.is_default,
    position: row.position,
  };
}

export function useContentViews(contentTypeId: string | undefined) {
  const qc = useQueryClient();
  const key = useMemo(() => ['admin-content-views', contentTypeId] as const, [contentTypeId]);

  // useQuery rather than an effect: no setState-in-effect, and switching
  // content types back and forth reuses the cache instead of refetching.
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!contentTypeId,
    queryFn: async (): Promise<SavedView[]> => {
      const { data: rows, error } = await viewsTable()
        .select('id,content_type,name,spec,is_default,position')
        .eq('content_type', contentTypeId!)
        .order('position')
        .order('created_at');
      if (error) {
        // A missing table (migration not applied yet) must not break the list;
        // the panel still works from its unsaved draft.
        console.error('Failed to load saved views:', error);
        return [];
      }
      return ((rows ?? []) as unknown as Row[]).map(toView);
    },
  });

  const views = data ?? [];
  const loading = isLoading;
  const reload = useCallback(() => {
    void qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  const createView = useCallback(
    async (name: string, spec: ViewSpec): Promise<SavedView | null> => {
      if (!contentTypeId) return null;
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast.error('Sign in to save a view.');
        return null;
      }
      const { data, error } = await viewsTable()
        .insert({
          user_id: userId,
          content_type: contentTypeId,
          name: name.trim(),
          spec: spec as never,
          position: views.length,
        })
        .select('id,content_type,name,spec,is_default,position')
        .single();
      if (error) {
        // The unique index is case- and padding-insensitive, so this is the
        // most likely failure and deserves its own message.
        toast.error(
          error.code === '23505' ? 'A view with that name already exists.' : 'Could not save view.',
        );
        return null;
      }
      reload();
      return toView(data as unknown as Row);
    },
    [contentTypeId, views.length, reload],
  );

  const updateView = useCallback(
    async (id: string, patch: { name?: string; spec?: ViewSpec }): Promise<boolean> => {
      const { error } = await viewsTable()
        .update({
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.spec !== undefined ? { spec: patch.spec as never } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) {
        toast.error(
          error.code === '23505' ? 'A view with that name already exists.' : 'Could not save view.',
        );
        return false;
      }
      reload();
      return true;
    },
    [reload],
  );

  const deleteView = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await viewsTable().delete().eq('id', id);
      if (error) {
        toast.error('Could not delete view.');
        return false;
      }
      reload();
      return true;
    },
    [reload],
  );

  const setDefaultView = useCallback(
    async (id: string): Promise<boolean> => {
      // One RPC, because clearing the old default and setting the new one has
      // to happen together or the partial unique index rejects the write.
      const { error } = await untypedRpc('set_default_content_view', { p_view_id: id });
      if (error) {
        toast.error('Could not set the default view.');
        return false;
      }
      reload();
      return true;
    },
    [reload],
  );

  return { views, loading, reload, createView, updateView, deleteView, setDefaultView };
}

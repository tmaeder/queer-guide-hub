import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { adminAction } from '@/lib/adminAction';
import { pruneDoc, countOverrides, type BrandingDoc } from './tokenCatalog';

export type SiteBrandingRow = {
  draft: BrandingDoc;
  published: BrandingDoc;
  published_version: number;
  overrides_enabled: boolean;
  updated_at: string;
};

export type BrandingVersion = {
  version: number;
  doc: BrandingDoc;
  note: string | null;
  published_at: string;
};

const QUERY_KEY = ['site-branding'];

/**
 * Single controller for the /admin/design surface: server row + local draft
 * buffer + RPC mutations. The local draft is a sparse override doc — presence
 * of a key means "overridden", absence means "default from tokenCatalog".
 */
export function useDesignSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<SiteBrandingRow> => {
      const { data, error } = await untypedFrom('site_branding')
        .select('draft,published,published_version,overrides_enabled,updated_at')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return data as unknown as SiteBrandingRow;
    },
  });

  // Local draft buffer. `null` means "not touched yet" — the effective draft
  // is then derived from the server row, so no seeding effect is needed and
  // reverts reseed by simply clearing the buffer.
  const [localDraft, setLocalDraft] = useState<BrandingDoc | null>(null);
  const draft = useMemo(
    () => localDraft ?? pruneDoc(query.data?.draft ?? {}),
    [localDraft, query.data],
  );

  const serverDraftJson = JSON.stringify(pruneDoc(query.data?.draft ?? {}));
  const localDraftJson = JSON.stringify(pruneDoc(draft));
  const isDirty = query.data != null && serverDraftJson !== localDraftJson;
  const publishedJson = JSON.stringify(pruneDoc(query.data?.published ?? {}));
  const hasUnpublished = query.data != null && localDraftJson !== publishedJson;
  const overrideCount = useMemo(() => countOverrides(pruneDoc(draft)), [draft]);

  const setTokenOverride = useCallback(
    (scope: 'light' | 'dark' | 'global', key: string, value: string | null) => {
      const tokens = { ...draft.tokens };
      const entries = { ...tokens[scope] };
      if (value === null) delete entries[key];
      else entries[key] = value;
      tokens[scope] = entries;
      setLocalDraft({ ...draft, tokens });
    },
    [draft],
  );

  const setField = useCallback(
    (section: 'meta' | 'manifest' | 'email', key: string, value: string | string[] | null) => {
      const entries = { ...(draft[section] as Record<string, unknown> | undefined) };
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete entries[key];
      } else {
        entries[key] = value;
      }
      setLocalDraft({ ...draft, [section]: entries } as BrandingDoc);
    },
    [draft],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveDraft = useMutation({
    mutationFn: async () => {
      const doc = pruneDoc(draft);
      const { error } = await untypedRpc('branding_save_draft', { p_doc: doc });
      if (error) throw new Error(error.message);
      return doc;
    },
    onSuccess: async () => {
      setLocalDraft(null); // server draft now equals the buffer — track it again
      await invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: async (note: string) => {
      // Persist the local buffer first so publish always ships what's on screen.
      const doc = pruneDoc(draft);
      const { error: draftError } = await untypedRpc('branding_save_draft', { p_doc: doc });
      if (draftError) throw new Error(draftError.message);
      const previousVersion = query.data?.published_version ?? 0;
      const { data, error } = await untypedRpc<number>('branding_publish', { p_note: note || null });
      if (error) throw new Error(error.message);
      return { newVersion: data, previousVersion };
    },
    onSuccess: async ({ newVersion, previousVersion }) => {
      await invalidate();
      queryClient.invalidateQueries({ queryKey: ['site-branding-versions'] });
      await adminAction({
        label: `Published branding v${newVersion}`,
        perform: () => undefined,
        // Undo re-publishes the previous version (only possible if one exists).
        undo:
          previousVersion >= 1
            ? async () => {
                const { error } = await untypedRpc('branding_revert', { p_version: previousVersion });
                if (error) throw new Error(error.message);
                await invalidate();
              }
            : undefined,
      });
    },
  });

  const revert = useMutation({
    mutationFn: async (version: number) => {
      const { data, error } = await untypedRpc<number>('branding_revert', { p_version: version });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (newVersion, version) => {
      setLocalDraft(null); // reseed the buffer from the reverted draft
      await invalidate();
      queryClient.invalidateQueries({ queryKey: ['site-branding-versions'] });
      await adminAction({
        label: `Reverted to v${version} (published as v${newVersion})`,
        perform: () => undefined,
      });
    },
  });

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await untypedRpc('branding_set_enabled', { p_enabled: enabled });
      if (error) throw new Error(error.message);
      return enabled;
    },
    onSuccess: async (enabled) => {
      await invalidate();
      await adminAction({
        label: enabled ? 'Branding overrides enabled' : 'Kill switch on — serving stock site',
        perform: () => undefined,
        undo: async () => {
          const { error } = await untypedRpc('branding_set_enabled', { p_enabled: !enabled });
          if (error) throw new Error(error.message);
          await invalidate();
        },
      });
    },
  });

  const resetDraftToPublished = useCallback(() => {
    setLocalDraft(pruneDoc(query.data?.published ?? {}));
  }, [query.data]);

  return {
    query,
    row: query.data ?? null,
    draft,
    overrideCount,
    isDirty,
    hasUnpublished,
    setTokenOverride,
    setField,
    saveDraft,
    publish,
    revert,
    setEnabled,
    resetDraftToPublished,
  };
}

export type DesignSettingsController = ReturnType<typeof useDesignSettings>;

export function useBrandingVersions(enabled: boolean) {
  return useQuery({
    queryKey: ['site-branding-versions'],
    enabled,
    queryFn: async (): Promise<BrandingVersion[]> => {
      const { data, error } = await untypedFrom('site_branding_versions')
        .select('version,doc,note,published_at')
        .order('version', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as BrandingVersion[];
    },
  });
}

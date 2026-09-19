import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';

export type Profile = Tables<'profiles'>;

export type ProfileUpdateResult = {
  data?: Profile | null;
  error: string | null;
  errorKind: 'auth' | 'transient' | null;
};

/** Shared query key so other hooks (e.g. useCurrency) can share the cache. */
export const profileQueryKey = (userId: string | null | undefined) => ['profile', userId] as const;

export const useProfile = () => {
  const { user } = useAuth();

  // react-query dedupes parallel callers via the shared queryKey, so multiple
  // mounts of useProfile (Header, Settings, etc.) coalesce into one network
  // request. useCurrency can read the same cache via queryClient.getQueryData
  // without an additional /profiles?select=preferences round-trip.
  const {
    data: profile = null,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: profileQueryKey(user?.id),
    // `authenticated` holds only a narrow column allowlist on `profiles` — a column
    // grant is per-ROLE, so it cannot say "all columns of my own row, few of anyone
    // else's". get_my_profile() is the SECURITY DEFINER path for the own-row half; it
    // reads auth.uid() itself and takes no argument.
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_my_profile').maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const updateProfile = async (updates: Partial<Profile>): Promise<ProfileUpdateResult> => {
    if (!user) {
      return { error: 'No user found', errorKind: 'auth' };
    }

    // Coerce empty strings to null so CHECK-constrained enum columns
    // (disability_status, chosen_family_status, etc.) don't reject the whole update.
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      sanitized[key] = value === '' ? null : value;
    }

    try {
      // UPDATE, never upsert. `authenticated` holds only COLUMN grants on profiles
      // (no table-level privilege at all — see 20540101100000). Postgres satisfies a
      // plain INSERT and a plain UPDATE from column grants, but `INSERT ... ON CONFLICT
      // DO UPDATE` requires table-level UPDATE and raises `42501 permission denied for
      // table profiles` — so every /settings save 403'd. Measured against prod and in a
      // controlled column-grant-only probe: INSERT ok, UPDATE ok, UPSERT 42501.
      // The row always exists: the `on_auth_user_created` trigger runs handle_new_user()
      // on signup, so the upsert's INSERT half was unreachable anyway.
      //
      // No trailing .select(): a bare .select() resolves to `select=*` and adds
      // `Prefer: return=representation`, so the UPDATE would RETURN all 173 columns —
      // which needs SELECT privilege on all 173. Without it the write is return=minimal
      // and needs nothing beyond the `user_id` in the WHERE. The fresh row comes back
      // through get_my_profile() instead.
      //
      // count: "exact" is load-bearing, not diagnostics: a WHERE that matches no row is
      // a 204 with no error, so without it a missing profile row would report "saved"
      // while nothing was written — the same silent lie this fix exists to remove.
      const { error, count } = await supabase
        .from('profiles')
        .update(
          {
            ...sanitized,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('user_id', user.id);

      if (error) throw error;
      if (count === 0) throw new Error('Profile row not found for this account');
      const { data } = await refetch();
      return { data: data ?? null, error: null, errorKind: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const errorKind = session ? 'transient' : 'auth';
      return { data: null, error: errorMessage, errorKind };
    }
  };

  const saveAvatarConfig = async (avatarConfig: Record<string, unknown>) => {
    if (!user) {
      return { error: 'No user found' };
    }

    try {
      // Same as updateProfile above: no .select(), refetch through the RPC.
      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_config: avatarConfig,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;
      const { data } = await refetch();
      return { data: data ?? null, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      return { data: null, error: errorMessage };
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) {
      return { error: 'No user found' };
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: data.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      await refetch();
      return { data: data.publicUrl, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      return { data: null, error: errorMessage };
    }
  };

  return {
    profile,
    loading,
    error: queryError instanceof Error ? queryError.message : null,
    updateProfile,
    uploadAvatar,
    saveAvatarConfig,
    refetchProfile: refetch,
  };
};

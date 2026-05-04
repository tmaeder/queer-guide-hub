import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

export type Profile = Tables<"profiles">;

/** Shared query key so other hooks (e.g. useCurrency) can share the cache. */
export const profileQueryKey = (userId: string | null | undefined) =>
  ["profile", userId] as const;

export const useProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const setProfile = (next: Profile | null) =>
    queryClient.setQueryData(profileQueryKey(user?.id), next);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) {
      return { error: "No user found" };
    }

    // Coerce empty strings to null so CHECK-constrained enum columns
    // (disability_status, bdsm_role, etc.) don't reject the whole update.
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      sanitized[key] = value === "" ? null : value;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            ...sanitized,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select()
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      return { data: null, error: errorMessage };
    }
  };

  const saveAvatarConfig = async (avatarConfig: Record<string, unknown>) => {
    if (!user) {
      return { error: "No user found" };
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          avatar_config: avatarConfig,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      return { data: null, error: errorMessage };
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) {
      return { error: "No user found" };
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: data.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (updateError) throw updateError;

      await refetch();
      return { data: data.publicUrl, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
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
